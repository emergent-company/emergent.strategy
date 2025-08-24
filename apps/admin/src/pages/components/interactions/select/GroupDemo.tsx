import "choices.js/public/assets/styles/choices.min.css";
import React, { useEffect, useRef } from "react";

export const GroupDemo = () => {
    const selectRef = useRef<HTMLSelectElement>(null);

    useEffect(() => {
        const select = selectRef.current;
        if (!select) return;
        import("choices.js").then(({ default: Choices }) => {
            new Choices(select);
        });
    }, []);

    return (
        <select ref={selectRef}>
            <option value="">Select an option</option>

            <optgroup label="Fruits">
                <option value="apple">Apple</option>
                <option value="banana">Banana</option>
                <option disabled value="orange">
                    Orange
                </option>
            </optgroup>

            <optgroup label="Vegetables">
                <option value="carrot">Carrot</option>
                <option value="broccoli">Broccoli</option>
                <option value="spinach">Spinach</option>
            </optgroup>

            <optgroup label="Others">
                <option value="bread">Bread</option>
                <option value="milk">Milk</option>
            </optgroup>
        </select>
    );
};
