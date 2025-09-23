import{j as e}from"./iframe-BQqEPkXj.js";import"./preload-helper-D9Z9MdNV.js";function r({colSpan:a,message:o="No results.",className:n,"data-testid":l}){return e.jsx("tr",{"data-testid":l,children:e.jsx("td",{colSpan:a,className:["opacity-70 py-8 text-center",n].filter(Boolean).join(" "),children:o})})}r.__docgenInfo={description:"",methods:[],displayName:"TableEmptyState",props:{colSpan:{required:!0,tsType:{name:"number"},description:""},message:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:"'No results.'",computed:!1}},className:{required:!1,tsType:{name:"string"},description:""},"data-testid":{required:!1,tsType:{name:"string"},description:""}}};const c={title:"Tables/TableEmptyState",component:r,argTypes:{colSpan:{control:{type:"number",min:1,max:12}}},args:{colSpan:4,message:"No data found."},parameters:{docs:{description:{component:"Utility row to show an inline empty state inside tables. Span columns via colSpan prop."}}},tags:["autodocs"]},t={render:a=>e.jsx("div",{className:"overflow-x-auto",children:e.jsxs("table",{className:"table w-full",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Col A"}),e.jsx("th",{children:"Col B"}),e.jsx("th",{children:"Col C"}),e.jsx("th",{children:"Col D"})]})}),e.jsx("tbody",{children:e.jsx(r,{...a})})]})})},s={args:{message:"Nothing to show here yet."}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  render: args => <div className="overflow-x-auto">
            <table className="table w-full">
                <thead>
                    <tr>
                        <th>Col A</th>
                        <th>Col B</th>
                        <th>Col C</th>
                        <th>Col D</th>
                    </tr>
                </thead>
                <tbody>
                    <TableEmptyState {...args as TableEmptyStateProps} />
                </tbody>
            </table>
        </div>
}`,...t.parameters?.docs?.source}}};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    message: "Nothing to show here yet."
  }
}`,...s.parameters?.docs?.source}}};const p=["Default","CustomMessage"];export{s as CustomMessage,t as Default,p as __namedExportsOrder,c as default};
