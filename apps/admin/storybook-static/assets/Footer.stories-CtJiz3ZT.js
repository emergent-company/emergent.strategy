import{j as e}from"./iframe-BQqEPkXj.js";import"./preload-helper-D9Z9MdNV.js";const o=({className:t,yearOverride:n,statusMessage:c})=>{const i=n??new Date().getFullYear();return e.jsxs("div",{role:"contentinfo",className:`flex flex-wrap justify-between items-center gap-3 px-6 py-3 w-full ${t??""}`,"data-testid":"app-footer",children:[e.jsxs("div",{className:"flex items-center gap-2.5 bg-base-100 hover:bg-base-200 shadow-xs px-2.5 py-1 border border-base-300 rounded-full transition-colors cursor-pointer",children:[e.jsx("span",{className:"status status-success","aria-label":"System Status: OK"}),e.jsx("p",{className:"text-sm text-base-content/80",children:c||"System running smoothly"})]}),e.jsxs("span",{className:"text-sm text-base-content/80",children:["© ",i," Nexus. All rights reserved"]})]})};o.__docgenInfo={description:"",methods:[],displayName:"Footer",props:{className:{required:!1,tsType:{name:"string"},description:""},yearOverride:{required:!1,tsType:{name:"number"},description:"Override year for testing or historical rendering"},statusMessage:{required:!1,tsType:{name:"string"},description:""}}};const p={title:"Organisms/Footer",component:o,args:{},parameters:{docs:{description:{component:"Footer organism presenting global system status and copyright."}}}},s={render:t=>e.jsx("div",{className:"border border-base-300",children:e.jsx(o,{...t})})},r={args:{statusMessage:"Background jobs: 5 queued"}},a={args:{yearOverride:2030}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: (args: FooterProps) => <div className="border border-base-300">
      <Footer {...args} />
    </div>
}`,...s.parameters?.docs?.source}}};r.parameters={...r.parameters,docs:{...r.parameters?.docs,source:{originalSource:`{
  args: {
    statusMessage: 'Background jobs: 5 queued'
  }
}`,...r.parameters?.docs?.source}}};a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    yearOverride: 2030
  }
}`,...a.parameters?.docs?.source}}};const u=["Default","CustomStatus","CustomYear"];export{r as CustomStatus,a as CustomYear,s as Default,u as __namedExportsOrder,p as default};
