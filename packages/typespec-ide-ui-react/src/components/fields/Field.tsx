import React from "react";
import "./Field.scss";
import FieldAlert, { FieldAlertProps } from "./FieldAlert";
import FieldBoolean, { FieldBooleanProps } from "./FieldBoolean";
import FieldEnum, { FieldEnumProps } from "./FieldEnum";
import FieldLabel, { FieldLabelProps } from "./FieldLabel";
import FieldNumber, { FieldNumberProps } from "./FieldNumber";
import FieldPath, { FieldPathProps } from "./FieldPath";
import FieldString, { FieldStringProps } from "./FieldString";

export interface FieldBaseProps {
  name: string;
  required?: boolean;
  deprecated?: boolean;
  description?: string;
}

export type FieldType =
  | "boolean"
  | "label"
  | "path"
  | "enum"
  | "number"
  | "string"
  | "alert";

export type FieldTypeProps =
  | FieldBooleanProps
  | FieldLabelProps
  | FieldPathProps
  | FieldEnumProps
  | FieldNumberProps
  | FieldStringProps
  | FieldAlertProps;

interface FieldProps {
  type: FieldType;
  typeProps: FieldTypeProps;
}

function Field(props: FieldProps): React.JSX.Element {
  switch (props.type) {
    case "boolean":
      return <FieldBoolean {...(props.typeProps as FieldBooleanProps)} />;
    case "label":
      return <FieldLabel {...(props.typeProps as FieldLabelProps)} />;
    case "path":
      return <FieldPath {...(props.typeProps as FieldPathProps)} />;
    case "enum":
      return <FieldEnum {...(props.typeProps as FieldEnumProps)} />;
    case "number":
      return <FieldNumber {...(props.typeProps as FieldNumberProps)} />;
    case "string":
      return <FieldString {...(props.typeProps as FieldStringProps)} />;
    default:
      return (
        <FieldAlert
          name={props.typeProps.name}
          alert={`Unsupported Field Type: ${props.type}`}
        />
      );
  }
}

export default Field;
