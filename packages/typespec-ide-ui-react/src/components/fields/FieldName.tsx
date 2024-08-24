import { escapeIdString } from "../../utils";
import { FieldBaseProps } from "./Field";
import "./FieldName.scss";

export default function FieldName(props: FieldBaseProps) {
  return (
    <label
      htmlFor={escapeIdString(props.name)}
      className={
        "field-label text-truncate " + (props.deprecated ? "deprecated" : "")
      }
      title={props.description}
    >
      {props.name}
      {props.required ? <b className="required">*</b> : ""}:
    </label>
  );
}
