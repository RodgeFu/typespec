import { Alert } from "react-bootstrap";
import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldAlertProps extends FieldBaseProps {
  alert: string;
}

export default function FieldAlert(props: Omit<FieldAlertProps, "type">) {
  return (
    <FieldContainer
      {...(props as FieldBaseProps)}
      valueElement={() => <Alert variant="danger">{props.alert}</Alert>}
    />
  );
}
