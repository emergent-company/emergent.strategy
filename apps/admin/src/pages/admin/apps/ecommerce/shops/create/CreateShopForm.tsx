import { Link } from "react-router";

export const CreateShopForm = () => {
    return (
        <div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="card bg-base-100 shadow">
                    <div className="card-body">
                        <div className="card-title">Basic Information</div>
                        <div className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="name">
                                    Name
                                </label>
                                <input type="text" className="input w-full" id="name" placeholder="Name" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label">Seller</label>
                                <select className="select w-full" defaultValue="" aria-label="Select seller">
                                    <option value="" disabled>
                                        Select seller
                                    </option>
                                    <option>Anthony S. Amaya</option>
                                    <option>Crystal R. Taylor</option>
                                    <option>Jeremy M. Simon</option>
                                    <option>Jane B. Bush</option>
                                    <option>Francis A. Bisson</option>
                                    <option>Lydia P. Barnett</option>
                                    <option>John B. Lopez</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="mobile">
                                    Mobile
                                </label>
                                <input type="tel" className="input w-full" id="mobile" placeholder="(098) 765 4321" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="email">
                                    Email
                                </label>
                                <input type="email" className="input w-full" id="email" placeholder="Email" />
                            </div>
                            <div className="col-span-1 space-y-2 lg:col-span-2">
                                <label className="fieldset-label" htmlFor="description">
                                    Description
                                </label>
                                <textarea
                                    placeholder="Description"
                                    id="description"
                                    className="textarea w-full"></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 h-fit shadow">
                    <div className="card-body">
                        <div className="card-title">Address</div>
                        <div className="fieldset mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="street-address">
                                    Street Address
                                </label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    id="street-address"
                                    placeholder="Street Address"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="city">
                                    City
                                </label>
                                <input type="text" className="input w-full" id="city" placeholder="City" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="state">
                                    State
                                </label>
                                <input type="text" className="input w-full" id="state" placeholder="State" />
                            </div>
                            <div className="space-y-2">
                                <label className="fieldset-label" htmlFor="postal-code">
                                    Postal Code
                                </label>
                                <input type="text" className="input w-full" id="postal-code" placeholder="564-879" />
                            </div>
                            <div className="flex items-center gap-3">
                                <input className="checkbox checkbox-sm" type="checkbox" id="set-as-active" />
                                <label className="label" htmlFor="set-as-active">
                                    Set as active
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
                <Link className="btn btn-sm btn-ghost" to="/apps/ecommerce/shops">
                    <span className="iconify lucide--x size-4" />
                    Cancel
                </Link>
                <Link className="btn btn-sm btn-primary" to="/apps/ecommerce/shops">
                    <span className="iconify lucide--check size-4" />
                    Save
                </Link>
            </div>
        </div>
    );
};
