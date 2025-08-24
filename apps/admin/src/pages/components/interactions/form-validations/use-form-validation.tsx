import * as z from "zod";
import { ChangeEvent, FormEvent, useState } from "react";
import { ZodObject, ZodRawShape } from "zod";

export const useFormValidation = <Shape extends ZodRawShape, T extends ZodObject<Shape>>({
    schema,
    initialValues,
}: {
    schema: T;
    initialValues: z.infer<T>;
}) => {
    type FormData = z.infer<T>;
    type FormErrors = Partial<Record<keyof FormData, string>>;
    type SchemaKeys = keyof FormData;

    const [formData, setFormData] = useState<FormData>(initialValues);
    const [errors, setErrors] = useState<FormErrors>({});

    const checkError = (key: SchemaKeys, value: unknown) => {
        const shape = schema.shape as unknown as Record<string, z.ZodType>;
        const fieldSchema = z.object({ [key]: shape[key as string] });
        const result = fieldSchema.safeParse({ [key]: value });

        setErrors((prev) => ({
            ...prev,
            [key]: result.success ? undefined : result.error.issues[0].message,
        }));
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        const { name, value, type } = target;
        const key = name as SchemaKeys;

        const parsed: string | number | boolean =
            type === "checkbox"
                ? (target as HTMLInputElement).checked
                : type === "number" || type === "range"
                  ? value === ""
                      ? ""
                      : Number(value)
                  : value;

        setFormData((prev) => ({ ...prev, [key]: parsed }));
        checkError(key, parsed);
    };

    const updateFormData = (key: SchemaKeys, value: unknown) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
        checkError(key, value);
    };

    const handleSubmit = (e: FormEvent, onSuccess: (data: FormData) => void) => {
        e.preventDefault();
        const res = schema.safeParse(formData);
        if (!res.success) {
            const newErrs: FormErrors = {};
            res.error.issues.forEach((issue) => {
                const k = issue.path[0] as SchemaKeys;
                newErrs[k] = issue.message;
            });
            setErrors(newErrs);
        } else {
            setErrors({});
            onSuccess(res.data);
        }
    };

    const handleClear = () => {
        setFormData(initialValues);
        setErrors({});
    };

    return {
        formData,
        errors,
        handleChange,
        handleSubmit,
        setFormData,
        updateFormData,
        handleClear,
        setErrors,
    };
};
