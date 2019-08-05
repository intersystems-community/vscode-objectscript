import { BaseProperty } from "./xdebugConnection";

export function formatPropertyValue(property: BaseProperty): string {
  let displayValue: string;
  if (property.hasChildren || property.type === "array" || property.type === "object") {
    if (property.type === "array") {
      // for arrays, show the length, like a var_dump would do
      displayValue = "array(" + (property.hasChildren ? property.numberOfChildren : 0) + ")";
    } else if (property.type === "object" && property.class) {
      // for objects, show the class name as type (if specified)
      displayValue = property.class;
    } else {
      // edge case: show the type of the property as the value
      displayValue = property.type;
    }
  } else {
    // for null, uninitialized, resource, etc. show the type
    displayValue = property.value || property.type === "string" ? property.value : property.type;
    if (property.type === "string") {
      displayValue = '"' + displayValue + '"';
    } else if (property.type === "bool") {
      displayValue = !!parseInt(displayValue) + "";
    }
  }
  return displayValue;
}
