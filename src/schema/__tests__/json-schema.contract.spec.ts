import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readJson(filePath: string): any {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function schemaObject(schema: any, defName: string): any {
    if (schema?.$defs?.[defName]) return schema.$defs[defName];
    if (schema?.definitions?.[defName]) return schema.definitions[defName];
    if (
        typeof schema?.$ref === "string" &&
        schema.$ref.startsWith("#/$defs/")
    ) {
        const name = schema.$ref.replace("#/$defs/", "");
        if (schema?.$defs?.[name]) return schema.$defs[name];
    }
    if (
        typeof schema?.$ref === "string" &&
        schema.$ref.startsWith("#/definitions/")
    ) {
        const name = schema.$ref.replace("#/definitions/", "");
        if (schema?.definitions?.[name]) return schema.definitions[name];
    }
    return schema;
}

describe("JSON schema contracts", () => {
    it("does not include the removed ServiceProps.orderKinds map", () => {
        const schemaPath = path.join(
            process.cwd(),
            "schema",
            "service-props.schema.json",
        );
        const schema = readJson(schemaPath);
        const serviceProps = schemaObject(schema, "ServiceProps");

        expect(serviceProps?.properties?.orderKinds).toBeUndefined();
    });

    it("includes option effects and recursive FieldOption children in service props schema", () => {
        const schemaPath = path.join(
            process.cwd(),
            "schema",
            "service-props.schema.json",
        );
        const schema = readJson(schemaPath);
        const serviceProps = schemaObject(schema, "ServiceProps");
        const fieldOption = schemaObject(schema, "FieldOption");

        expect(
            serviceProps?.properties?.option_effects_for_buttons,
        ).toBeTruthy();
        expect(schemaObject(schema, "OptionEffectForButton")).toBeTruthy();
        expect(fieldOption?.properties?.children).toBeTruthy();
    });

    it("includes field default values and trigger value effects in service props schema", () => {
        const schemaPath = path.join(
            process.cwd(),
            "schema",
            "service-props.schema.json",
        );
        const schema = readJson(schemaPath);
        const serviceProps = schemaObject(schema, "ServiceProps");
        const field = schemaObject(schema, "Field");

        expect(JSON.stringify(field)).toContain("defaultValue");
        expect(
            serviceProps?.properties?.value_effects_for_triggers,
        ).toBeTruthy();
        expect(schemaObject(schema, "FieldValueEffect")).toBeTruthy();
    });

    it("exports order snapshot schema from package exports", () => {
        const pkgPath = path.join(process.cwd(), "package.json");
        const pkg = readJson(pkgPath);
        expect(pkg?.exports?.["./json/order-snapshot"]).toBe(
            "./schema/order-snapshot.schema.json",
        );
    });
});
