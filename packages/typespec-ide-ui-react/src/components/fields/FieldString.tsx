import { numberToInt } from "../../utils";
import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldStringProps extends FieldBaseProps {
  defaultValue?: string;
  placeHolder?: string;
  readOnly?: "false" | "true";
  onChange?: (value: string) => void;

  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export default function FieldString(props: FieldStringProps) {
  return (
    <FieldContainer
      {...(props as FieldBaseProps)}
      valueElement={() => (
        <input
          type="text"
          readOnly={props.readOnly === "true"}
          placeholder={props.placeHolder}
          defaultValue={props.defaultValue}
          minLength={props.minLength ? numberToInt(props.minLength) : undefined}
          maxLength={props.maxLength ? numberToInt(props.maxLength) : undefined}
          pattern={props.pattern}
          onChange={(e) =>{ if(props.onChange)props.onChange(e.target.value);}}
        />
      )}
    />
  );
}
