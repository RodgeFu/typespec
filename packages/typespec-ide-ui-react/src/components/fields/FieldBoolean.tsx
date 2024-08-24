import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldBooleanProps extends FieldBaseProps {
  defaultValue?: boolean;
  readOnly?: "false" | "true";
  onChange: (value: boolean) => void;
}

export default function FieldBoolean(props: FieldBooleanProps) {
  return (
    <FieldContainer
      {...(props as FieldBaseProps)}
      valueElement={() => (
        <input
          type="checkbox"
          readOnly={props.readOnly === "true"}
          defaultChecked={props.defaultValue?.toString() === "true"}
          onChange={(e) => props.onChange(e.target.value === "true")}
        />
      )}
    />
  );
}
