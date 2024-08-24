import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldNumberProps extends FieldBaseProps {
  defaultValue?: number;
  readOnly?: "false" | "true";
  onChange: (value: number) => void;

  min?: number;
  max?: number;
  step?: number;
}

export default function FieldNumber(props: FieldNumberProps) {
  return (
    <FieldContainer
      {...(props as FieldBaseProps)}
      valueElement={() => (
        <input
          type="number"
          readOnly={props.readOnly === "true"}
          defaultValue={props.defaultValue?.toString()}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
      )}
    />
  );
}
