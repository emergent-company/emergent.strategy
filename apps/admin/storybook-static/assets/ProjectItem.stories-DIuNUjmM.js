import{j as i}from"./iframe-BQqEPkXj.js";import{S as d}from"./index-B5g2QZoj.js";import"./preload-helper-D9Z9MdNV.js";import"./index-CqALXU3L.js";const n=o=>i.jsx(d,{...o});n.__docgenInfo={description:"",methods:[],displayName:"SidebarProjectItem"};const g={title:"Layout/Sidebar/ProjectDropdown/ProjectItem",component:n,args:{project:{id:"p-1",name:"Core API",status:"active"},active:!1},parameters:{layout:"centered",docs:{description:{component:"Single stateless project row used inside the project dropdown. Provides accessible button semantics and handles active state via props."}}}},e={},r={args:{active:!0}},t={args:{project:{id:"p-long",name:"Extremely Verbose Project Name That Should Truncate Gracefully In The UI",status:"indexing"}}},a={args:{project:{id:"p-2",name:"Indexer",status:"paused"}}},s={args:{onSelect:(o,c)=>alert(`Select handler invoked for ${c} (${o})`)},parameters:{docs:{description:{story:"Demonstrates the onSelect callback firing when the row is clicked."}}}};e.parameters={...e.parameters,docs:{...e.parameters?.docs,source:{originalSource:"{}",...e.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    active: true
  }
}`,...r.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  args: {
    project: {
      id: 'p-long',
      name: 'Extremely Verbose Project Name That Should Truncate Gracefully In The UI',
      status: 'indexing'
    }
  }
}`,...t.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    project: {
      id: 'p-2',
      name: 'Indexer',
      status: 'paused'
    }
  }
}`,...a.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    onSelect: (id: string, name: string) => alert(\`Select handler invoked for \${name} (\${id})\`)
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates the onSelect callback firing when the row is clicked.'
      }
    }
  }
}`,...s.parameters?.docs?.source}}};const S=["Default","Active","LongName","WithStatusPaused","SelectHandler"];export{r as Active,e as Default,t as LongName,s as SelectHandler,a as WithStatusPaused,S as __namedExportsOrder,g as default};
