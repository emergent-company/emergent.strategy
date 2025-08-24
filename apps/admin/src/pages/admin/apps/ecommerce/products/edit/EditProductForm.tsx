import { Link } from "react-router";

import { FileUploader } from "@/components/forms/FileUploader";

export const EditProductForm = () => {
    return (
        <div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Basic Information</div>
                        <fieldset className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="name">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="name"
                                    placeholder="Name"
                                    defaultValue="Men's tracking shoes"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="category">
                                    Category
                                </label>
                                <select
                                    className="select w-full"
                                    defaultValue=""
                                    aria-label="Select Category"
                                    id="category">
                                    <option value="" disabled>
                                        Select category
                                    </option>
                                    <option>Fashion</option>
                                    <option>Daily Need</option>
                                    <option>Cosmetic</option>
                                    <option>Electronic</option>
                                    <option>Food</option>
                                </select>
                            </div>
                            <div className="col-span-1 space-y-2 lg:col-span-2">
                                <label className="fieldset-label" htmlFor="description">
                                    Description
                                </label>
                                <textarea
                                    placeholder="Description"
                                    id="description"
                                    defaultValue="A dummy description"
                                    className="textarea w-full"></textarea>
                            </div>
                        </fieldset>
                    </div>
                </div>
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Upload Image</div>
                        <div className="mt-5">
                            <FileUploader
                                files={["/images/apps/ecommerce/products/1.jpg"]}
                                labelIdle={`<div>Drag and Drop your files or <span style="text-decoration: underline">Browse</span></div>`}
                            />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Pricing</div>
                        <fieldset className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="cost-price">
                                    Cost Price
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--dollar-sign text-base-content/60 size-4"></span>
                                    <input
                                        className="grow"
                                        id="cost-price"
                                        placeholder="0"
                                        type="number"
                                        min="0"
                                        defaultValue="49"
                                    />
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="sale-price">
                                    Sale Price
                                </label>
                                <label className="input w-full">
                                    <span className="iconify lucide--dollar-sign text-base-content/60 size-4"></span>
                                    <input
                                        className="grow"
                                        id="sale-price"
                                        placeholder="0"
                                        type="number"
                                        min="0"
                                        defaultValue="39"
                                    />
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="discount">
                                    Discount
                                </label>
                                <label className="input w-full">
                                    <input
                                        className="grow"
                                        placeholder="0"
                                        id="discount"
                                        type="number"
                                        min="0"
                                        max="100"
                                        defaultValue="15"
                                    />
                                    <span className="iconify lucide--percent text-base-content/60 size-4"></span>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="tax">
                                    Tax
                                </label>
                                <label className="input w-full">
                                    <input
                                        className="grow"
                                        placeholder="0"
                                        id="tax"
                                        type="number"
                                        min="0"
                                        max="100"
                                        defaultValue="18"
                                    />
                                    <span className="iconify lucide--percent text-base-content/60 size-4"></span>
                                </label>
                            </div>
                        </fieldset>
                    </div>
                </div>
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Inventory</div>
                        <div className="fieldset mt-2 gap-4">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="sku">
                                    SKU
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="sku"
                                    defaultValue="SHOES"
                                    placeholder="SKU (Stock Keeping Unit)"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="fieldset-label" htmlFor="stock">
                                        Stock
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="input w-full"
                                        id="stock"
                                        placeholder="Stock"
                                        defaultValue="25"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="fieldset-label" htmlFor="stock-alert">
                                        Stock Alert
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="input w-full"
                                        id="stock-alert"
                                        placeholder="Stock alert"
                                        defaultValue="10"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">SEO (Meta)</div>
                        <div className="fieldset mt-2 gap-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="fieldset-label" htmlFor="slug">
                                        Slug
                                    </label>
                                    <input
                                        type="text"
                                        className="input w-full"
                                        id="slug"
                                        placeholder="Slug"
                                        defaultValue="shoes"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="fieldset-label" htmlFor="title">
                                        Title
                                    </label>
                                    <input
                                        type="text"
                                        className="input w-full"
                                        placeholder="Meta"
                                        id="title"
                                        defaultValue="Shoes"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="meta-description">
                                    Description
                                </label>
                                <textarea
                                    placeholder="Description"
                                    className="textarea w-full"
                                    defaultValue="A dummy meta description"
                                    id="meta-description"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Shipping</div>
                        <div className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="weight">
                                    Weight
                                </label>
                                <label className="input w-full">
                                    <input
                                        className="grow"
                                        placeholder="0"
                                        id="weight"
                                        type="number"
                                        min="0"
                                        defaultValue="125"
                                    />
                                    <span className="text-base-content/60">gm</span>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="width">
                                    Width
                                </label>
                                <label className="input w-full">
                                    <input
                                        className="grow"
                                        placeholder="0"
                                        id="width"
                                        type="number"
                                        min="0"
                                        defaultValue="2.54"
                                    />
                                    <span className="text-base-content/60">In</span>
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="height">
                                    Height
                                </label>
                                <label className="input w-full">
                                    <input
                                        className="grow"
                                        placeholder="0"
                                        id="height"
                                        type="number"
                                        min="0"
                                        defaultValue="3.24"
                                    />
                                    <span className="text-base-content/60">In</span>
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="depth">
                                    Depth
                                </label>
                                <label className="input w-full">
                                    <input
                                        className="grow"
                                        placeholder="0"
                                        id="depth"
                                        type="number"
                                        min="0"
                                        defaultValue="1.24"
                                    />
                                    <span className="text-base-content/60">In</span>
                                </label>
                            </div>

                            <div className="flex items-center gap-5">
                                <label className="label" htmlFor="free_shipping">
                                    Free Shipping
                                </label>
                                <input className="toggle toggle-sm" type="checkbox" id="free_shipping" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
                <Link className="btn btn-sm btn-ghost" to="/apps/ecommerce/products">
                    <span className="iconify lucide--x size-4" />
                    Cancel
                </Link>
                <Link className="btn btn-sm btn-primary" to="/apps/ecommerce/products">
                    <span className="iconify lucide--arrow-up-from-line size-4" />
                    Update
                </Link>
            </div>
        </div>
    );
};
