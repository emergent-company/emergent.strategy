#!/usr/bin/env python3
"""Run a question bank end to end against a strategy-server.

A model answers each question through the server's MCP tools (OpenCode with an
isolated configuration and no tools but the server's), another model grades the
answer against the bank's gold answer. Answers and grades are kept on disk, so a
run can be resumed, re-graded and audited. Standard library only; needs the
`opencode` CLI and a provider it can use.

Bank format (Markdown), one block per question:

    ### Q01. The question as a manager would ask it?
    - **Type:** lookup. **Sets:** S
    - **Gold answer:** the facts a correct answer must contain
    - **Must not:** typical wrong answers; doing any of them is a failure
    - **Where it lives:** where in the strategy the answer is

An optional section whose heading starts with "Reading rules" is passed to the
grader, which reports breaking them in its own flag and does not lower the score.

Commands (all take --bank, --out and --tag):

    run      answer the questions        --model, --mcp-url, --company, --instance,
                                         provider (--vertex-project and --vertex-location,
                                         or --provider-json FILE), [--skill FILE ...]
    judge    grade saved answers         --judge-model, plus the provider arguments
    report   scores, flags, tool use and cost of a tag
    ground   numbers in the answers that are not in the strategy text
                                         (--mcp-url, --instance)
    selftest checks of the parsing and scoring helpers, no network

Choosing questions: --only Q01,Q02  --set S  --exclude Q56.

Notes
- The grader is a model and compares only with the bank's gold answers. Run a
  tag twice before reading a difference: question scores move between runs.
- The OpenCode configuration is written to OUT/cfg and used through
  XDG_CONFIG_HOME, so your own configuration, instructions and MCP servers are
  not loaded. OpenCode's built-in `execute` tool cannot be denied without
  removing the server's tools; `report` audits every call and counts uses of its
  mutating actions.
- On macOS the dev server can exit when OpenCode's MCP client connects and resets
  the connection at once (accept: setsockopt: invalid argument). Put
  mcp_proxy.py in front of it and give --mcp-url the proxy's address.
"""
import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

JUDGE_DEFAULT = 'google-vertex/gemini-4-argon'
MODEL_DEFAULT = 'google-vertex/claude-sonnet-5-5@default'
LOCAL_TOOLS = ('shell', 'edit', 'read', 'glob', 'grep', 'webfetch', 'websearch', 'skill', 'subagent',
               'external_directory', 'list_mcp_resources', 'read_mcp_resource')


# ---------------------------------------------------------------- the bank

def parse_bank(text):
    """Returns (questions, reading rules text)."""
    rules = re.search(r'^## Reading rules.*?(?=^## )', text, re.S | re.M)
    qs = []
    for m in re.finditer(r'^### (Q\d+)\.\s*(.+?)\n(.*?)(?=^### |^## |\Z)', text, re.S | re.M):
        qid, q, body = m.group(1), m.group(2).strip(), m.group(3)

        def field(pat):
            f = re.search(pat, body, re.S)
            return f.group(1).strip() if f else ''
        qs.append({
            'id': qid, 'q': q,
            'type': field(r'\*\*Type:\*\*\s*([^\n]*?)\s*(?:\*\*Sets:|\n|$)').rstrip('.'),
            'sets': field(r'\*\*Sets:\*\*\s*([^\n]*)'),
            'gold': field(r'\*\*Gold answer:\*\*(.*?)(?=\n- \*\*(?:Must not|Where it lives|Corrected)|\Z)'),
            'must': field(r'\*\*Must not:\*\*(.*?)(?=\n- \*\*|\Z)'),
            'waiting': 'Waiting' in body,
        })
    return qs, (rules.group(0) if rules else '')


def pick(qs, a):
    if a.only:
        want = set(a.only.split(','))
        qs = [q for q in qs if q['id'] in want]
    if a.set:
        qs = [q for q in qs if a.set in [s.strip() for s in q['sets'].split(',')]]
    if a.exclude:
        drop = set(a.exclude.split(','))
        qs = [q for q in qs if q['id'] not in drop]
    return qs


# ---------------------------------------------------------------- opencode

def write_config(a, system_extra):
    """Writes the isolated OpenCode configuration and returns its directory."""
    provider = {}
    if a.provider_json:
        provider = json.load(open(a.provider_json))
    elif a.vertex_project:
        provider = {'google-vertex': {'options': {'location': a.vertex_location, 'project': a.vertex_project}}}
    system = (
        "You answer questions from a company's management team about the company's strategy. The only source you may use "
        "is the strategy server, whose tools are available to you. Find the right strategy instance first (list the "
        "instances; the company is %s and its instance is named %s). Answer from what the server returns and say plainly "
        "when it does not say. Do not use outside knowledge about the company." % (a.company, a.instance))
    if system_extra:
        system += '\n\n' + system_extra
    cfg = {
        '$schema': 'https://opencode.ai/config.json',
        'provider': provider,
        'mcp': {'servers': {'strat': {'type': 'remote', 'url': a.mcp_url, 'oauth': False, 'codemode': False}}},
        'default_agent': 'answerer',
        'agents': {
            'answerer': {'mode': 'primary', 'description': 'Answers management questions from the strategy server',
                         'system': system, 'steps': 40,
                         'permissions': [{'action': t, 'resource': '*', 'effect': 'deny'} for t in LOCAL_TOOLS]},
            'judge': {'mode': 'primary', 'description': 'Scores an answer against a gold answer',
                      'system': 'You are a strict grader. You use no tools. Reply with a single JSON object and nothing else.',
                      'permissions': [{'action': '*', 'resource': '*', 'effect': 'deny'}], 'steps': 2},
        },
    }
    d = os.path.join(a.out, 'cfg')
    os.makedirs(os.path.join(d, 'opencode'), exist_ok=True)
    json.dump(cfg, open(os.path.join(d, 'opencode', 'opencode.json'), 'w'), indent=2)
    return d


def opencode(a, model, agent, prompt, secs):
    env = dict(os.environ, XDG_CONFIG_HOME=os.path.abspath(os.path.join(a.out, 'cfg')))
    run_dir = os.path.join(a.out, 'run')
    os.makedirs(run_dir, exist_ok=True)
    r = subprocess.run(['perl', '-e', 'alarm %d; exec @ARGV' % secs, 'opencode', 'run', '--standalone', '--agent', agent,
                        '--model', model, '--format', 'json', prompt], cwd=run_dir, env=env, capture_output=True, text=True)
    return r.stdout, r.returncode


def events_of(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('{'):
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def events(path):
    return events_of(open(path).read())


def final_answer(ev):
    last_tool = max([i for i, e in enumerate(ev) if e.get('type') == 'tool_use'], default=-1)
    texts = [e['part'].get('text', '') for i, e in enumerate(ev) if e.get('type') == 'text' and i > last_tool]
    if not texts:
        texts = [e['part'].get('text', '') for e in ev if e.get('type') == 'text']
    return '\n'.join(t for t in texts if t).strip()


def usage(ev):
    cost = sum(e['part'].get('cost', 0) or 0 for e in ev if e.get('type') == 'step_finish')
    tok = collections.Counter()
    for e in ev:
        if e.get('type') == 'step_finish':
            t = e['part'].get('tokens', {})
            tok['input'] += t.get('input', 0)
            tok['output'] += t.get('output', 0)
    return cost, dict(tok)


MUTATING = re.compile(r'tools\.opencode\.(worktree_create|worktree_remove|session_move|session_rename)')


def audit(ev):
    """Names of the tools called, and the execute calls that used a mutating built-in action."""
    names, flagged = [], []
    for e in ev:
        if e.get('type') != 'tool_use':
            continue
        p = e['part']
        names.append(p.get('tool'))
        code = ((p.get('state') or {}).get('input') or {}).get('code', '') if p.get('tool') == 'execute' else ''
        if MUTATING.search(code or ''):
            flagged.append(code[:200])
    return names, flagged


# ---------------------------------------------------------------- judging

def judge_prompt(q, answer, rules):
    return f'''You grade an answer to a management question against the gold answer written for it.

QUESTION: {q['q']}
TYPE: {q['type']}

GOLD ANSWER (the facts a correct answer must contain; codes such as kr-c-005 are there so the grader can trace a fact and are not wording for the answer):
{q['gold']}

MUST NOT (typical wrong answers; doing any of them is a failure):
{q['must']}

READING RULES (apply to every answer):
{rules[:1800] or '(none given)'}

ANSWER TO GRADE:
{answer or '(empty)'}

Scoring (about facts and the Must-not list only; do NOT lower the score for reading-rule problems, report those in code_in_body):
2 = every fact of the gold answer is present (wording may differ; numbers, dates and names must match) and no Must-not item is done. Where the gold says the strategy is silent, not yet written, or that only a framework template exists, the answer says so.
1 = some but not all gold facts, or all of them with a minor error, and no Must-not item is done.
0 = the gold answer is missed or contradicted, or a Must-not item is done.

Flags:
- must_not: the answer does something on the Must-not list.
- template_as_strategy: the answer presents EPF framework templates, examples or definitions as this company's own content.
- code_in_body: internal codes (kr-/okr-/asm- identifiers, decision numbers, definition ids such as pd-031, field or file names) appear in the body of the answer, outside a closing sources line.
- unsupported: list up to 3 short quotes of specific claims in the answer that are not in the gold answer and that you cannot verify from it. Do not treat a true fact the gold omits as a failure, only list it.

Reply with one JSON object and nothing else:
{{"score": 0, "missing": ["gold facts that are absent"], "must_not": false, "template_as_strategy": false, "code_in_body": false, "unsupported": [], "reason": "one sentence"}}'''


def parse_json(text):
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except ValueError:
        return None


# ---------------------------------------------------------------- commands

def tag_dir(a):
    d = os.path.join(a.out, 'out', a.tag)
    os.makedirs(d, exist_ok=True)
    return d


def cmd_run(a, qs, rules):
    skill = '\n\n'.join(open(f).read().strip() for f in (a.skill or []))
    write_config(a, skill)
    d = tag_dir(a)
    meta = os.path.join(d, 'meta.json')
    if not os.path.exists(meta):
        json.dump({'model': a.model, 'skill_files': {f: hashlib.sha256(open(f, 'rb').read()).hexdigest()[:12] for f in (a.skill or [])},
                   'mcp_url': a.mcp_url, 'started': time.strftime('%Y-%m-%d %H:%M:%S')}, open(meta, 'w'), indent=1)

    def one(q):
        f = os.path.join(d, q['id'] + '.answer.jsonl')
        if os.path.exists(f) and os.path.getsize(f) > 0:
            return q['id'], 'cached'
        t = time.time()
        out, rc = opencode(a, a.model, 'answerer', q['q'], a.timeout)
        open(f, 'w').write(out)
        return q['id'], 'ok rc=%d %.0fs' % (rc, time.time() - t)
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        for qid, st in ex.map(one, qs):
            print(qid, st, flush=True)


def cmd_judge(a, qs, rules):
    write_config(a, '')
    d = tag_dir(a)

    def one(q):
        jf = os.path.join(d, q['id'] + '.judge.json')
        af = os.path.join(d, q['id'] + '.answer.jsonl')
        if os.path.exists(jf):
            return q['id'], 'cached'
        if not os.path.exists(af):
            return q['id'], 'no answer'
        ans = final_answer(events(af))
        res, jev = None, []
        for _ in range(2):
            out, _rc = opencode(a, a.judge_model, 'judge', judge_prompt(q, ans, rules), 300)
            jev = events_of(out)
            res = parse_json(final_answer(jev))
            if res and 'score' in res:
                break
        json.dump({'judge': a.judge_model, 'result': res, 'cost': usage(jev)[0]}, open(jf, 'w'), indent=1)
        return q['id'], 'ok' if res else 'unparsed'
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        for qid, st in ex.map(one, qs):
            print(qid, st, flush=True)


def cmd_report(a, qs, rules):
    d = tag_dir(a)
    rows = []
    for q in qs:
        af, jf = (os.path.join(d, q['id'] + s) for s in ('.answer.jsonl', '.judge.json'))
        if not os.path.exists(af):
            continue
        ev = events(af)
        names, flagged = audit(ev)
        j = (json.load(open(jf)) if os.path.exists(jf) else {}).get('result') or {}
        rows.append((q, usage(ev)[0], names, flagged, j))
    n = len(rows)
    scored = [r for r in rows if 'score' in r[4]]
    print('answers: %d | graded: %d | tag: %s' % (n, len(scored), a.tag))
    sc = collections.Counter(r[4]['score'] for r in scored)
    print('score 2 / 1 / 0: %d / %d / %d | points %d of %d' % (sc[2], sc[1], sc[0], 2 * sc[2] + sc[1], 2 * len(scored)))
    flag = lambda k: sum(1 for r in scored if r[4].get(k))
    print('flags: must_not %d | template_as_strategy %d | code_in_body %d | answers with unsupported claims listed %d' % (
        flag('must_not'), flag('template_as_strategy'), flag('code_in_body'), sum(1 for r in scored if r[4].get('unsupported'))))
    tools = collections.Counter(t for r in rows for t in r[2])
    print('tool calls: %d (median %d per answer) | top: %s' % (
        sum(tools.values()), sorted(len(r[2]) for r in rows)[n // 2] if n else 0, dict(tools.most_common(5))))
    print('answers that called no strategy tool: %s' % [r[0]['id'] for r in rows if not any((t or '').startswith('strat_') for t in r[2])])
    print('audit: execute calls using mutating built-in actions: %d' % sum(len(r[3]) for r in rows))
    judge_cost = sum((json.load(open(os.path.join(d, q['id'] + '.judge.json'))).get('cost') or 0)
                     for q in qs if os.path.exists(os.path.join(d, q['id'] + '.judge.json')))
    answer_cost = sum(r[1] for r in rows)
    print('cost: answering $%.2f (mean $%.3f) | grading $%.2f (the provider may not report it)' % (answer_cost, answer_cost / n if n else 0, judge_cost))
    print()
    for q, cost, names, _flagged, j in rows:
        if not j:
            print('%-5s (not graded) tools=%d $%.3f' % (q['id'], len(names), cost))
            continue
        flags = ''.join(c for c, k in (('M', 'must_not'), ('T', 'template_as_strategy'), ('C', 'code_in_body'), ('U', 'unsupported')) if j.get(k))
        print('%-5s score %s %-4s tools=%2d $%.3f | %s' % (q['id'], j.get('score'), flags, len(names), cost, (j.get('reason') or '')[:110]))


# ---- grounding: numbers in answers that the strategy text does not contain

NUM = re.compile(r'(?<![\w.])(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.(\d+))?\s?(%|k|m|bn|M|K)?(?![\w])')


def number_values(s):
    out = set()
    for m in NUM.finditer(s):
        whole = m.group(1).replace(',', '').replace(' ', '')
        try:
            v = float(whole + ('.' + m.group(2) if m.group(2) else ''))
        except ValueError:
            continue
        suffix = (m.group(3) or '').lower()
        out.add(round(v, 4))
        if suffix == 'k':
            out.add(round(v * 1e3, 4))
        if suffix == 'm':
            out.update((round(v * 1e6, 4), round(v * 1e3, 4)))
        if suffix == 'bn':
            out.add(round(v * 1e9, 4))
    return out


def worth_checking(m):
    if m.group(2) is None and not m.group(3):
        v = int(m.group(1).replace(',', '').replace(' ', ''))
        if v < 10 or 1990 <= v <= 2035:
            return False
    return True


def ungrounded_numbers(answer, corpus_values):
    bad = []
    for m in NUM.finditer(answer):
        if worth_checking(m) and not (number_values(m.group(0)) & corpus_values):
            bad.append((m.group(0).strip(), answer[max(0, m.start() - 45):m.end() + 25].replace('\n', ' ')))
    return bad


class MCP:
    def __init__(self, url):
        self.url = url
        _, _ = self._post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'bank_eval', 'version': '1'}}}, init=True)

    def _post(self, body, init=False):
        h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
        if getattr(self, 'sid', None):
            h['Mcp-Session-Id'] = self.sid
        r = urllib.request.urlopen(urllib.request.Request(self.url, json.dumps(body).encode(), h), timeout=120)
        txt = r.read().decode()
        if not txt.lstrip().startswith('{'):
            txt = [ln[5:] for ln in txt.splitlines() if ln.startswith('data:')][-1]
        if init:
            self.sid = r.headers.get('Mcp-Session-Id')
        return self.sid, json.loads(txt)

    def call(self, name, args):
        _, r = self._post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}})
        txt = r['result']['content'][0]['text']
        try:
            return json.loads(txt)
        except ValueError:
            return txt


def section_text(m, instance_id, artifact, path=None, depth=0):
    """Text of a section. The server caps one read, so a truncated section comes
    back as an outline: descend into its children until the content arrives."""
    args = {'instance_id': instance_id, 'artifact': artifact, 'max_chars': 1000000}
    if path:
        args['path'] = path
    s = m.call('get_section', args)
    if not isinstance(s, dict):
        return str(s)
    if s.get('content') not in (None, '') or not s.get('truncated'):
        return json.dumps(s.get('content'), ensure_ascii=False)
    if depth > 8:
        return ''
    return ' '.join(section_text(m, instance_id, artifact, c['path'], depth + 1) for c in (s.get('children') or []) if c.get('path'))


def strategy_text(url, instance_name):
    """All authored text of an instance, read through the server's own tools."""
    m = MCP(url)
    insts = []
    for ws in m.call('list_workspaces', {}).get('Workspaces', []):
        insts += m.call('list_instances', {'workspace_id': ws['id']}).get('Instances', [])
    inst = next((i for i in insts if i.get('name') == instance_name), None)
    if not inst:
        sys.exit('no instance named %r; have %s' % (instance_name, [i.get('name') for i in insts]))
    outline = m.call('get_outline', {'instance_id': inst['id']})
    return ' '.join(section_text(m, inst['id'], art.get('artifact') or art.get('artifact_key')) for art in outline.get('artifacts', []))


def cmd_ground(a, qs, rules):
    d = tag_dir(a)
    corpus = number_values(strategy_text(a.mcp_url, a.instance))
    total = 0
    bad = collections.defaultdict(list)
    for q in qs:
        af = os.path.join(d, q['id'] + '.answer.jsonl')
        if not os.path.exists(af):
            continue
        ans = final_answer(events(af))
        total += sum(1 for m in NUM.finditer(ans) if worth_checking(m))
        for tok, ctx in ungrounded_numbers(ans, corpus):
            bad[q['id']].append((tok, ctx))
    nb = sum(len(v) for v in bad.values())
    print('numbers checked (small integers and years excluded): %d | not in the strategy text: %d in %d answers' % (total, nb, len(bad)))
    for qid, items in sorted(bad.items()):
        for tok, ctx in items[:3]:
            print('  %-5s %-10s ...%s...' % (qid, tok, ctx))


def cmd_selftest(_a, _qs, _rules):
    sample = '''# Bank

## Reading rules for every answer
- No codes in the body.

## A. Direction
### Q01. What is the vision?
- **Asked by:** anyone. **Type:** lookup. **Sets:** S, C
- **Gold answer:**
  - To be the best.
- **Must not:** invent a vision.
- **Where it lives:** `00_north_star`.

### Q02. Is it approved?
- **Type:** silent.
- **Gold answer:** no approval is recorded.
- **Must not:** say it is approved.
- Waiting for a source.
'''
    qs, rules = parse_bank(sample)
    assert [q['id'] for q in qs] == ['Q01', 'Q02'], qs
    assert qs[0]['type'] == 'lookup' and qs[0]['sets'] == 'S, C', qs[0]
    assert 'To be the best' in qs[0]['gold'] and qs[0]['must'].startswith('invent'), qs[0]
    assert qs[1]['waiting'] and qs[1]['gold'].startswith('no approval'), qs[1]
    assert 'No codes' in rules
    ev = [{'type': 'tool_use', 'part': {'tool': 'strat_search_strategy', 'state': {'input': {}}}},
          {'type': 'text', 'part': {'text': 'draft before the last tool'}},
          {'type': 'tool_use', 'part': {'tool': 'execute', 'state': {'input': {'code': 'await tools.opencode.session_rename({title: "x"})'}}}},
          {'type': 'text', 'part': {'text': 'The final answer.'}},
          {'type': 'step_finish', 'part': {'cost': 0.25, 'tokens': {'input': 3, 'output': 4}}}]
    assert final_answer(ev) == 'The final answer.'
    assert usage(ev) == (0.25, {'input': 3, 'output': 4})
    names, flagged = audit(ev)
    assert names == ['strat_search_strategy', 'execute'] and len(flagged) == 1, (names, flagged)
    assert parse_json('Sure:\n```json\n{"score": 2, "reason": "ok"}\n```')['score'] == 2
    assert parse_json('no json here') is None
    p = judge_prompt(qs[0], 'An answer.', rules)
    assert 'To be the best' in p and 'An answer.' in p and 'No codes' in p and 'invent a vision' in p
    corpus = number_values('Revenue was NOK 17.0M and growth 38% in 2026; 1,234 users.')
    assert not ungrounded_numbers('It was 17 million? No: NOK 17M and 38%, 1 234 users.', corpus), 'grounded numbers flagged'
    assert [t for t, _ in ungrounded_numbers('Revenue is 99% and NOK 4.2M.', corpus)] == ['99%', '4.2M']

    class Stub:
        """A server whose root section is too large: only an outline, then two children."""
        def call(self, name, args):
            assert name == 'get_section'
            if not args.get('path'):
                return {'truncated': True, 'content': None, 'children': [{'path': 'a'}, {'path': 'b'}]}
            return {'truncated': False, 'content': {'text': 'part %s costs 313k' % args['path']}}
    text = section_text(Stub(), 'i', 'art')
    assert 'part a' in text and 'part b' in text and 'costs 313k' in text, text
    assert not ungrounded_numbers('It costs EUR 313k.', number_values(text))
    print('selftest ok')


def main():
    ap = argparse.ArgumentParser(description='Run a question bank end to end against a strategy-server.', formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('Commands')[0])
    ap.add_argument('cmd', choices=['run', 'judge', 'report', 'ground', 'selftest'])
    ap.add_argument('--bank'); ap.add_argument('--out', default='bank-eval-out'); ap.add_argument('--tag')
    ap.add_argument('--model', default=MODEL_DEFAULT); ap.add_argument('--judge-model', default=JUDGE_DEFAULT)
    ap.add_argument('--mcp-url'); ap.add_argument('--company'); ap.add_argument('--instance')
    ap.add_argument('--vertex-project'); ap.add_argument('--vertex-location', default='global'); ap.add_argument('--provider-json')
    ap.add_argument('--skill', action='append', help='file appended to the answering agent\'s system prompt (repeatable)')
    ap.add_argument('--only'); ap.add_argument('--set'); ap.add_argument('--exclude')
    ap.add_argument('--jobs', type=int, default=3); ap.add_argument('--timeout', type=int, default=900)
    a = ap.parse_args()
    if a.cmd == 'selftest':
        return cmd_selftest(a, None, None)
    for need in ('bank', 'tag') + (('mcp_url', 'company', 'instance') if a.cmd == 'run' else ()) + (('mcp_url', 'instance') if a.cmd == 'ground' else ()):
        if not getattr(a, need):
            ap.error('--%s is required for %s' % (need.replace('_', '-'), a.cmd))
    if a.cmd in ('run', 'judge') and not (a.vertex_project or a.provider_json):
        ap.error('give --vertex-project (and --vertex-location) or --provider-json')
    if a.cmd == 'judge' and not a.mcp_url:
        a.mcp_url, a.company, a.instance = 'http://127.0.0.1:1/mcp', 'unused', 'unused'
    qs, rules = parse_bank(open(a.bank).read())
    qs = pick(qs, a)
    {'run': cmd_run, 'judge': cmd_judge, 'report': cmd_report, 'ground': cmd_ground}[a.cmd](a, qs, rules)


if __name__ == '__main__':
    main()
