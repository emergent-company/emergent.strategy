import{r as q,j as e}from"./iframe-BQqEPkXj.js";import{a as T}from"./storyAction-BfVmMc05.js";import"./preload-helper-D9Z9MdNV.js";const B=new Set(["img"]);function k(s){const{color:a,variant:o,size:t,shape:i,wide:l,fullWidth:d,loading:c,active:w,disabled:u,className:m,startIcon:j,endIcon:p}=s,r=["btn"];return(j&&!c||p)&&r.push("gap-2"),t&&r.push(`btn-${t}`),i&&r.push(`btn-${i}`),o&&o!=="solid"&&r.push(`btn-${o}`),a&&r.push(`btn-${a}`),l&&r.push("btn-wide"),d&&r.push("btn-block"),w&&r.push("btn-active"),u&&r.push("btn-disabled"),m&&r.push(m),r.join(" ")}const n=q.forwardRef(function({tag:a="button",children:o,loading:t,startIcon:i,endIcon:l,disabled:d,...c},w){const u=a,m=k({...c,loading:t,disabled:d,startIcon:i,endIcon:l}),j=e.jsxs(e.Fragment,{children:[t&&e.jsx("span",{className:"loading loading-spinner loading-sm","aria-hidden":"true","data-testid":"button-loading"}),i&&!t&&e.jsx("span",{className:"inline-flex items-center",children:i}),o,l&&e.jsx("span",{className:"inline-flex items-center",children:l})]}),p={ref:w,className:m,disabled:d&&a==="button"?!0:void 0};return B.has(a)?e.jsx(u,{...c,...p}):e.jsx(u,{...c,...p,children:j})});n.__docgenInfo={description:"",methods:[],displayName:"Button",props:{color:{required:!1,tsType:{name:"union",raw:`| 'neutral'
| 'primary'
| 'secondary'
| 'accent'
| 'info'
| 'success'
| 'warning'
| 'error'
| 'ghost'`,elements:[{name:"literal",value:"'neutral'"},{name:"literal",value:"'primary'"},{name:"literal",value:"'secondary'"},{name:"literal",value:"'accent'"},{name:"literal",value:"'info'"},{name:"literal",value:"'success'"},{name:"literal",value:"'warning'"},{name:"literal",value:"'error'"},{name:"literal",value:"'ghost'"}]},description:""},variant:{required:!1,tsType:{name:"union",raw:"'solid' | 'outline' | 'dash' | 'soft' | 'link'",elements:[{name:"literal",value:"'solid'"},{name:"literal",value:"'outline'"},{name:"literal",value:"'dash'"},{name:"literal",value:"'soft'"},{name:"literal",value:"'link'"}]},description:""},size:{required:!1,tsType:{name:"union",raw:"'xs' | 'sm' | 'md' | 'lg' | 'xl'",elements:[{name:"literal",value:"'xs'"},{name:"literal",value:"'sm'"},{name:"literal",value:"'md'"},{name:"literal",value:"'lg'"},{name:"literal",value:"'xl'"}]},description:""},shape:{required:!1,tsType:{name:"union",raw:"'circle' | 'square'",elements:[{name:"literal",value:"'circle'"},{name:"literal",value:"'square'"}]},description:""},wide:{required:!1,tsType:{name:"boolean"},description:""},fullWidth:{required:!1,tsType:{name:"boolean"},description:""},loading:{required:!1,tsType:{name:"boolean"},description:""},active:{required:!1,tsType:{name:"boolean"},description:""},disabled:{required:!1,tsType:{name:"boolean"},description:""},startIcon:{required:!1,tsType:{name:"ReactNode"},description:""},endIcon:{required:!1,tsType:{name:"ReactNode"},description:""},className:{required:!1,tsType:{name:"string"},description:""},tag:{required:!1,tsType:{name:"T"},description:"",defaultValue:{value:"'button'",computed:!1}}}};const W={title:"Atoms/Button",component:n,parameters:{docs:{description:{component:"Atom-level button derived from legacy src/components/ui/Button. Legacy import path deprecated (removal after 2025-11)."},source:{state:"open"}}},args:{children:"Click me",onClick:T("click"),color:"primary"},argTypes:{color:{control:"select",options:["neutral","primary","secondary","accent","info","success","warning","error","ghost"]},variant:{control:"select",options:["solid","outline","dash","soft","link"]},size:{control:"select",options:["xs","sm","md","lg","xl"]},shape:{control:"select",options:["circle","square",void 0]}},tags:["autodocs"]},f={},g={args:{loading:!0}},h={args:{startIcon:e.jsx("span",{className:"lucide--arrow-right iconify"}),endIcon:e.jsx("span",{className:"iconify lucide--check"})}},x={render:s=>e.jsx("div",{className:"flex flex-wrap gap-3",children:["solid","outline","dash","soft","link"].map(a=>e.jsx(n,{...s,variant:a,children:a},a))})},v={render:s=>e.jsx("div",{className:"flex flex-wrap items-end gap-3",children:["xs","sm","md","lg","xl"].map(a=>e.jsx(n,{...s,size:a,children:a},a))})},y={render:s=>e.jsx("div",{className:"flex flex-wrap gap-3",children:["neutral","primary","secondary","accent","info","success","warning","error","ghost"].map(a=>e.jsx(n,{...s,color:a,children:a},a))})},N={args:{fullWidth:!0},parameters:{layout:"fullscreen"}},b={render:s=>e.jsxs("div",{className:"flex flex-wrap gap-3",children:[e.jsx(n,{...s,shape:"circle",children:e.jsx("span",{className:"iconify lucide--star"})}),e.jsx(n,{...s,shape:"square",children:e.jsx("span",{className:"iconify lucide--heart"})})]})};f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:"{}",...f.parameters?.docs?.source}}};g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    loading: true
  }
}`,...g.parameters?.docs?.source}}};h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    startIcon: <span className="lucide--arrow-right iconify" />,
    endIcon: <span className="iconify lucide--check" />
  }
}`,...h.parameters?.docs?.source}}};x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: args => <div className="flex flex-wrap gap-3">
      {(['solid', 'outline', 'dash', 'soft', 'link'] as const).map(variant => <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>)}
    </div>
}`,...x.parameters?.docs?.source}}};v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  render: args => <div className="flex flex-wrap items-end gap-3">
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(size => <Button key={size} {...args} size={size}>
          {size}
        </Button>)}
    </div>
}`,...v.parameters?.docs?.source}}};y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  render: args => <div className="flex flex-wrap gap-3">
      {(['neutral', 'primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error', 'ghost'] as const).map(color => <Button key={color} {...args} color={color}>
          {color}
        </Button>)}
    </div>
}`,...y.parameters?.docs?.source}}};N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    fullWidth: true
  },
  parameters: {
    layout: 'fullscreen'
  }
}`,...N.parameters?.docs?.source}}};b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: args => <div className="flex flex-wrap gap-3">
      <Button {...args} shape="circle">
        <span className="iconify lucide--star" />
      </Button>
      <Button {...args} shape="square">
        <span className="iconify lucide--heart" />
      </Button>
    </div>
}`,...b.parameters?.docs?.source}}};const C=["Primary","Loading","WithIcons","Variants","Sizes","Colors","FullWidth","Shapes"];export{y as Colors,N as FullWidth,g as Loading,f as Primary,b as Shapes,v as Sizes,x as Variants,h as WithIcons,C as __namedExportsOrder,W as default};
