import{j as t}from"./iframe-BQqEPkXj.js";import{C as c}from"./index-BBYgyYcT.js";import{C as d}from"./index-083O14Ds.js";import{a as r}from"./storyAction-BfVmMc05.js";import"./preload-helper-D9Z9MdNV.js";import"./index-CqALXU3L.js";import"./index-CDOSlDlo.js";import"./index-C2vI11oT.js";import"./index-wSADcztn.js";const u=[{icon:"lucide--sparkles",title:"Summarize Document",desc:"Get a concise summary of your document.",prompt:"Summarize the key points of the latest ingested document."},{icon:"lucide--list-checks",title:"Action Items",desc:"Extract action items from a meeting.",prompt:"List the action items from the meeting transcript with owners and due dates."},{icon:"lucide--help-circle",title:"Ask a Question",desc:"Query your knowledge base.",prompt:"What are the critical requirements mentioned in the requirements document?"}];function s({onPickPrompt:o,onSubmit:a,cards:m=u}){return t.jsxs("div",{className:"w-full",children:[t.jsx("div",{className:"gap-6 grid md:grid-cols-3 mt-6",children:m.map(e=>t.jsx(c,{icon:e.icon,title:e.title,desc:e.desc,onPick:()=>o(e.prompt)},e.title))}),t.jsx(d,{onSubmit:a})]})}s.__docgenInfo={description:"",methods:[],displayName:"NewChatCtas",props:{onPickPrompt:{required:!0,tsType:{name:"signature",type:"function",raw:"(p: string) => void | Promise<void>",signature:{arguments:[{type:{name:"string"},name:"p"}],return:{name:"union",raw:"void | Promise<void>",elements:[{name:"void"},{name:"Promise",elements:[{name:"void"}],raw:"Promise<void>"}]}}},description:""},onSubmit:{required:!0,tsType:{name:"signature",type:"function",raw:"(p: string, opts?: { isPrivate?: boolean }) => void | Promise<void>",signature:{arguments:[{type:{name:"string"},name:"p"},{type:{name:"signature",type:"object",raw:"{ isPrivate?: boolean }",signature:{properties:[{key:"isPrivate",value:{name:"boolean",required:!1}}]}},name:"opts"}],return:{name:"union",raw:"void | Promise<void>",elements:[{name:"void"},{name:"Promise",elements:[{name:"void"}],raw:"Promise<void>"}]}}},description:""},cards:{required:!1,tsType:{name:"Array",elements:[{name:"NewChatCard"}],raw:"NewChatCard[]"},description:"",defaultValue:{value:`[
    {
        icon: "lucide--sparkles",
        title: "Summarize Document",
        desc: "Get a concise summary of your document.",
        prompt: "Summarize the key points of the latest ingested document.",
    },
    {
        icon: "lucide--list-checks",
        title: "Action Items",
        desc: "Extract action items from a meeting.",
        prompt: "List the action items from the meeting transcript with owners and due dates.",
    },
    {
        icon: "lucide--help-circle",
        title: "Ask a Question",
        desc: "Query your knowledge base.",
        prompt: "What are the critical requirements mentioned in the requirements document?",
    },
]`,computed:!1}}}};const k={title:"Chat/NewChatCtas",component:s,args:{onPickPrompt:r("onPickPrompt"),onSubmit:r("onSubmit")}},i={},n={args:{cards:[{icon:"lucide--file-text",title:"Summarize",desc:"Summarize text.",prompt:"Summarize:"},{icon:"lucide--alarm-clock",title:"Deadlines",desc:"List deadlines.",prompt:"Find deadlines:"},{icon:"lucide--check",title:"Decisions",desc:"Show decisions.",prompt:"Decisions:"}]}};i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:"{}",...i.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  args: {
    cards: [{
      icon: "lucide--file-text",
      title: "Summarize",
      desc: "Summarize text.",
      prompt: "Summarize:"
    }, {
      icon: "lucide--alarm-clock",
      title: "Deadlines",
      desc: "List deadlines.",
      prompt: "Find deadlines:"
    }, {
      icon: "lucide--check",
      title: "Decisions",
      desc: "Show decisions.",
      prompt: "Decisions:"
    }] as NewChatCard[]
  }
}`,...n.parameters?.docs?.source}}};const P=["Default","CustomCards"];export{n as CustomCards,i as Default,P as __namedExportsOrder,k as default};
