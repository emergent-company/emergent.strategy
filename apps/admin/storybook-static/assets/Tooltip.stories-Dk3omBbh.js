import{j as t}from"./iframe-BQqEPkXj.js";import{T as n}from"./index-CDOSlDlo.js";import"./preload-helper-D9Z9MdNV.js";const l={title:"Atoms/Tooltip",component:n,args:{placement:"top",content:t.jsx("span",{className:"font-medium",children:"Tooltip content"})}},o={render:e=>t.jsx("div",{className:"p-10 flex justify-center",children:t.jsx(n,{...e,children:t.jsx("button",{className:"btn btn-outline",children:"Hover me"})})})},s={render:()=>t.jsx("div",{className:"grid grid-cols-2 gap-8 p-10",children:["top","right","bottom","left"].map(e=>t.jsx(n,{placement:e,content:t.jsxs("span",{children:[e," tooltip"]}),children:t.jsx("button",{className:"btn btn-sm",children:e})},e))})};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: (args: TooltipProps) => <div className="p-10 flex justify-center">
      <Tooltip {...args}>
        <button className="btn btn-outline">Hover me</button>
      </Tooltip>
    </div>
}`,...o.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div className="grid grid-cols-2 gap-8 p-10">
      {(['top', 'right', 'bottom', 'left'] as const).map(p => <Tooltip key={p} placement={p} content={<span>{p} tooltip</span>}>
          <button className="btn btn-sm">{p}</button>
        </Tooltip>)}
    </div>
}`,...s.parameters?.docs?.source}}};const p=["Default","Placements"];export{o as Default,s as Placements,p as __namedExportsOrder,l as default};
