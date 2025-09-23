import{S as s}from"./index-BPe7-S1f.js";import"./iframe-BQqEPkXj.js";import"./preload-helper-D9Z9MdNV.js";import"./index-CqALXU3L.js";import"./index-B5g2QZoj.js";const i={title:"Organisms/Sidebar/SidebarProjectDropdown",component:s,parameters:{layout:"centered",location:"/admin/documents"}},t=[{id:"p1",name:"Alpha"},{id:"p2",name:"Beta Release"},{id:"p3",name:"Gamma Long Named Project For Truncation Test"}],e={args:{projects:[],activeProjectId:void 0}},r={args:{loading:!0}},a={args:{projects:t,activeProjectId:"p2",activeProjectName:"Beta Release"}},o={args:{projects:t,errorMsg:"Failed to fetch projects"}};e.parameters={...e.parameters,docs:{...e.parameters?.docs,source:{originalSource:`{
  args: {
    projects: [],
    activeProjectId: undefined
  }
}`,...e.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    loading: true
  }
}`,...r.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    projects: sampleProjects,
    activeProjectId: 'p2',
    activeProjectName: 'Beta Release'
  }
}`,...a.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    projects: sampleProjects,
    errorMsg: 'Failed to fetch projects'
  }
}`,...o.parameters?.docs?.source}}};const j=["Empty","Loading","WithProjects","ErrorState"];export{e as Empty,o as ErrorState,r as Loading,a as WithProjects,j as __namedExportsOrder,i as default};
