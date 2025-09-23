import{j as e,u as g,r as a,a as x}from"./iframe-BQqEPkXj.js";import{S as n}from"./Sidebar-DyvLjWAp.js";import"./index-BKx0i3hD.js";import"./preload-helper-D9Z9MdNV.js";import"./index-Cdt7tlWj.js";import"./index-CypjT-PP.js";import"./index-CqALXU3L.js";import"./index-Bk3soyip.js";import"./index-DkNetPqX.js";import"./index-BPe7-S1f.js";import"./index-B5g2QZoj.js";const I=({path:t})=>{const r=g();return a.useEffect(()=>{r(t)},[]),null},W={title:"Layout/Sidebar",component:n,decorators:[t=>e.jsxs("div",{className:"bg-base-200 border border-base-300 rounded-box w-[300px] h-[650px] overflow-hidden",children:[e.jsx(I,{path:"/admin/documents"}),e.jsx(t,{})]})],parameters:{layout:"centered",docs:{description:{component:`Compositional Sidebar using <Sidebar> -> <Sidebar.Section> -> <Sidebar.MenuItem>. Activation is based on current router pathname. Nested items expand via internal state.

Import styles:

Compound (preferred):
import Sidebar from '@/components/layout/sidebar';

<Sidebar><Sidebar.Section title='X'><Sidebar.MenuItem id='x' url='/x'>X</Sidebar.MenuItem></Sidebar.Section></Sidebar>

Named (backward compatible):
import { Sidebar, SidebarSection, SidebarMenuItem } from '@/components/layout/sidebar';`}}}},c={render:()=>e.jsxs(n,{children:[e.jsxs(n.Section,{title:"Overview",children:[e.jsx(n.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(n.MenuItem,{id:"chunks",url:"/admin/chunks",icon:"lucide--square-stack",children:"Chunks"}),e.jsx(n.MenuItem,{id:"chat",url:"/admin/chat",icon:"lucide--message-square",children:"Chat"})]}),e.jsx(n.Section,{title:"Settings",children:e.jsx(n.MenuItem,{id:"prompts",url:"/admin/ai-prompts",icon:"lucide--brain-circuit",children:"AI Prompts"})})]})},o={render:()=>e.jsxs(n,{children:[e.jsx(M,{}),e.jsxs(n.Section,{title:"Overview",children:[e.jsx(n.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(n.MenuItem,{id:"chunks",url:"/admin/chunks",icon:"lucide--square-stack",children:"Chunks"})]}),e.jsx(n.Section,{title:"Settings",children:e.jsx(n.MenuItem,{id:"prompts",url:"/admin/ai-prompts",icon:"lucide--brain-circuit",children:"AI Prompts"})})]})},m={render:()=>e.jsx(n,{children:e.jsxs(n.Section,{title:"Knowledge Base",children:[e.jsxs(n.MenuItem,{id:"kb",icon:"lucide--library",collapsible:!0,children:["Knowledge",e.jsx(n.MenuItem,{id:"kb-docs",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(n.MenuItem,{id:"kb-chunks",url:"/admin/chunks",icon:"lucide--square-stack",children:"Chunks"}),e.jsx(n.MenuItem,{id:"kb-stats",url:"/admin/stats",icon:"lucide--bar-chart-3",badges:["new"],children:"Stats"})]}),e.jsx(n.MenuItem,{id:"chat",url:"/admin/chat",icon:"lucide--message-square",children:"Chat"})]})})},u={name:"Loading (skeleton)",render:()=>e.jsx(n,{children:e.jsxs(n.Section,{children:[e.jsxs("div",{className:"flex items-center gap-2 px-2.5 py-1.5",children:[e.jsx("span",{className:"rounded w-4 h-4 skeleton"}),e.jsx("span",{className:"w-28 h-3 skeleton"})]}),e.jsxs("div",{className:"flex items-center gap-2 px-2.5 py-1.5",children:[e.jsx("span",{className:"rounded w-4 h-4 skeleton"}),e.jsx("span",{className:"w-24 h-3 skeleton"})]}),e.jsxs("div",{className:"flex items-center gap-2 px-2.5 py-1.5",children:[e.jsx("span",{className:"rounded w-4 h-4 skeleton"}),e.jsx("span",{className:"w-20 h-3 skeleton"})]})]})})},l={render:()=>e.jsx(n,{children:e.jsx(n.Section,{title:"Overview",children:e.jsx("div",{className:"px-3 py-2 text-xs text-base-content/60",children:"No items available"})})})},p={render:()=>e.jsx(n,{children:e.jsxs(n.Section,{title:"Monitoring",children:[e.jsx(n.MenuItem,{id:"jobs",url:"/admin/jobs",icon:"lucide--cpu",badges:["new"],children:"Jobs"}),e.jsx(n.MenuItem,{id:"alerts",url:"/admin/alerts",icon:"lucide--bell",badges:["new","beta"],children:"Alerts"}),e.jsxs(n.MenuItem,{id:"reports",icon:"lucide--chart-pie",collapsible:!0,badges:["new"],children:["Reports",e.jsx(n.MenuItem,{id:"rep-daily",url:"/admin/reports/daily",icon:"lucide--sunrise",children:"Daily"}),e.jsx(n.MenuItem,{id:"rep-monthly",url:"/admin/reports/monthly",icon:"lucide--calendar",children:"Monthly"})]})]})})},b={render:()=>e.jsx(n,{children:e.jsxs(n.Section,{title:"Overview",children:[e.jsx(n.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(n.MenuItem,{id:"chat",url:"/admin/chat",icon:"lucide--message-square",children:"Chat"})]})}),parameters:{docs:{description:{story:"Hover the right edge (panel-left-dashed icon) to toggle the dense/hover sidebar mode."}}}},S={name:"With Project Dropdown (many projects)",render:()=>{const t=()=>{const{setActiveOrg:r}=x();a.useEffect(()=>{r("org-demo","Demo Org")},[r]);const h=a.useMemo(()=>Array.from({length:12}).map((d,i)=>({id:`proj-${i+1}`,name:`Project ${i+1}`,status:i%3===0?"active":i%3===1?"indexing":"paused"})),[]),{config:s,setActiveProject:j}=x();return e.jsxs(n,{children:[e.jsx(n.ProjectDropdown,{activeProjectId:s.activeProjectId,activeProjectName:s.activeProjectName,projects:h,onSelectProject:(d,i)=>j(d,i),onAddProject:()=>alert("Add project (parent modal)")}),e.jsxs(n.Section,{title:"Overview",children:[e.jsx(n.MenuItem,{id:"documents",url:"/admin/documents",icon:"lucide--file-text",children:"Documents"}),e.jsx(n.MenuItem,{id:"chunks",url:"/admin/chunks",icon:"lucide--square-stack",children:"Chunks"})]})]})};return e.jsx(t,{})},parameters:{docs:{description:{story:"Demonstrates the project dropdown with a larger list (12 mock projects) and varied status values without hitting the real API."}}}},M=()=>{const{setActiveOrg:t,config:r,setActiveProject:h}=x();a.useEffect(()=>{t("org-demo","Demo Org")},[t]);const s=a.useMemo(()=>[{id:"p-1",name:"Core API",status:"active"},{id:"p-2",name:"Indexer",status:"indexing"},{id:"p-3",name:"Docs",status:"paused"}],[]);return e.jsx(n.ProjectDropdown,{activeProjectId:r.activeProjectId,activeProjectName:r.activeProjectName,projects:s,onSelectProject:(j,d)=>h(j,d),onAddProject:()=>alert("Create project (parent modal)")})};c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
            <Sidebar.Section title="Overview">
                <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
                    Documents
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="chunks" url="/admin/chunks" icon="lucide--square-stack">
                    Chunks
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="chat" url="/admin/chat" icon="lucide--message-square">
                    Chat
                </Sidebar.MenuItem>
            </Sidebar.Section>
            <Sidebar.Section title="Settings">
                <Sidebar.MenuItem id="prompts" url="/admin/ai-prompts" icon="lucide--brain-circuit">
                    AI Prompts
                </Sidebar.MenuItem>
            </Sidebar.Section>
        </Sidebar>
}`,...c.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
            <SidebarProjectDropdownWrapper />
            <Sidebar.Section title="Overview">
                <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
                    Documents
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="chunks" url="/admin/chunks" icon="lucide--square-stack">
                    Chunks
                </Sidebar.MenuItem>
            </Sidebar.Section>
            <Sidebar.Section title="Settings">
                <Sidebar.MenuItem id="prompts" url="/admin/ai-prompts" icon="lucide--brain-circuit">
                    AI Prompts
                </Sidebar.MenuItem>
            </Sidebar.Section>
        </Sidebar>
}`,...o.parameters?.docs?.source}}};m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
            <Sidebar.Section title="Knowledge Base">
                <Sidebar.MenuItem id="kb" icon="lucide--library" collapsible>
                    Knowledge
                    <Sidebar.MenuItem id="kb-docs" url="/admin/documents" icon="lucide--file-text">
                        Documents
                    </Sidebar.MenuItem>
                    <Sidebar.MenuItem id="kb-chunks" url="/admin/chunks" icon="lucide--square-stack">
                        Chunks
                    </Sidebar.MenuItem>
                    <Sidebar.MenuItem id="kb-stats" url="/admin/stats" icon="lucide--bar-chart-3" badges={["new"]}>
                        Stats
                    </Sidebar.MenuItem>
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="chat" url="/admin/chat" icon="lucide--message-square">
                    Chat
                </Sidebar.MenuItem>
            </Sidebar.Section>
        </Sidebar>
}`,...m.parameters?.docs?.source}}};u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  name: "Loading (skeleton)",
  render: () => <Sidebar>
            <Sidebar.Section>
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="rounded w-4 h-4 skeleton" />
                    <span className="w-28 h-3 skeleton" />
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="rounded w-4 h-4 skeleton" />
                    <span className="w-24 h-3 skeleton" />
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="rounded w-4 h-4 skeleton" />
                    <span className="w-20 h-3 skeleton" />
                </div>
            </Sidebar.Section>
        </Sidebar>
}`,...u.parameters?.docs?.source}}};l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
            <Sidebar.Section title="Overview">
                <div className="px-3 py-2 text-xs text-base-content/60">No items available</div>
            </Sidebar.Section>
        </Sidebar>
}`,...l.parameters?.docs?.source}}};p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
            <Sidebar.Section title="Monitoring">
                <Sidebar.MenuItem id="jobs" url="/admin/jobs" icon="lucide--cpu" badges={["new"]}>
                    Jobs
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="alerts" url="/admin/alerts" icon="lucide--bell" badges={["new", "beta"]}>
                    Alerts
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="reports" icon="lucide--chart-pie" collapsible badges={["new"]}>
                    Reports
                    <Sidebar.MenuItem id="rep-daily" url="/admin/reports/daily" icon="lucide--sunrise">
                        Daily
                    </Sidebar.MenuItem>
                    <Sidebar.MenuItem id="rep-monthly" url="/admin/reports/monthly" icon="lucide--calendar">
                        Monthly
                    </Sidebar.MenuItem>
                </Sidebar.MenuItem>
            </Sidebar.Section>
        </Sidebar>
}`,...p.parameters?.docs?.source}}};b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: () => <Sidebar>
            <Sidebar.Section title="Overview">
                <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
                    Documents
                </Sidebar.MenuItem>
                <Sidebar.MenuItem id="chat" url="/admin/chat" icon="lucide--message-square">
                    Chat
                </Sidebar.MenuItem>
            </Sidebar.Section>
        </Sidebar>,
  parameters: {
    docs: {
      description: {
        story: "Hover the right edge (panel-left-dashed icon) to toggle the dense/hover sidebar mode."
      }
    }
  }
}`,...b.parameters?.docs?.source}}};S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  name: "With Project Dropdown (many projects)",
  render: () => {
    const Wrapper: React.FC = () => {
      const {
        setActiveOrg
      } = useConfig();
      React.useEffect(() => {
        setActiveOrg("org-demo", "Demo Org");
      }, [setActiveOrg]);
      const mockProjects: Project[] = React.useMemo(() => Array.from({
        length: 12
      }).map((_, i) => ({
        id: \`proj-\${i + 1}\`,
        name: \`Project \${i + 1}\`,
        status: i % 3 === 0 ? "active" : i % 3 === 1 ? "indexing" : "paused"
      })), []);
      const {
        config,
        setActiveProject
      } = useConfig();
      return <Sidebar>
                    <Sidebar.ProjectDropdown activeProjectId={config.activeProjectId} activeProjectName={config.activeProjectName} projects={mockProjects} onSelectProject={(id, name) => setActiveProject(id, name)} onAddProject={() => alert("Add project (parent modal)")} />
                    <Sidebar.Section title="Overview">
                        <Sidebar.MenuItem id="documents" url="/admin/documents" icon="lucide--file-text">
                            Documents
                        </Sidebar.MenuItem>
                        <Sidebar.MenuItem id="chunks" url="/admin/chunks" icon="lucide--square-stack">
                            Chunks
                        </Sidebar.MenuItem>
                    </Sidebar.Section>
                </Sidebar>;
    };
    return <Wrapper />;
  },
  parameters: {
    docs: {
      description: {
        story: "Demonstrates the project dropdown with a larger list (12 mock projects) and varied status values without hitting the real API."
      }
    }
  }
}`,...S.parameters?.docs?.source}}};const q=["Default","WithProjectDropdown","WithNestedItems","Loading","Empty","WithBadges","HoverToggle","WithManyProjects"];export{c as Default,l as Empty,b as HoverToggle,u as Loading,p as WithBadges,S as WithManyProjects,m as WithNestedItems,o as WithProjectDropdown,q as __namedExportsOrder,W as default};
