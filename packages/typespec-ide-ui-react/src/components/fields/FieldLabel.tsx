import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldLabelProps extends FieldBaseProps {
  label: string;
}

export default function FieldLabel(props: FieldLabelProps) {
  return (
    <FieldContainer
      {...(props as FieldBaseProps)}
      valueElement={() => <label>{props.label}</label>}
    />
  );
}
