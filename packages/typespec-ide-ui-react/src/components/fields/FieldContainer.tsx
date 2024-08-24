import React from "react";
import { Alert } from "react-bootstrap";
import { anythingToString } from "../../utils";
import { FieldBaseProps } from "./Field";
import FieldName from "./FieldName";

export interface FieldContainerProps extends FieldBaseProps {
  valueElement: () => React.JSX.Element;
}

export default function FieldContainer(props: FieldContainerProps) {
  let ele: React.JSX.Element | undefined = undefined;
  try {
    ele = props.valueElement() ?? (
      <Alert variant="danger">{`Unexpected Field Value 'undefined'`}</Alert>
    );
  } catch (e) {
    ele = (
      <Alert variant="danger">{`Unexpected error: ${anythingToString(e)}`}</Alert>
    );
  }
  return (
    <div className="d-flex field">
      <FieldName {...props} />
      {ele}
    </div>
  );
}
