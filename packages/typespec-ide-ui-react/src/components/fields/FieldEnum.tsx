import { useState } from "react";
import { Dropdown, DropdownButton } from "react-bootstrap";
import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldEnumProps extends FieldBaseProps {
  options: string[];
  defaultValue?: string;
  readOnly?: "false" | "true";
  onChange: (value: string) => void;
}

export default function FieldEnum(props: FieldEnumProps) {
  let dftValue = props.defaultValue;
  if (!dftValue || props.options.indexOf(dftValue) === -1) {
    dftValue = props.options.length > 0 ? props.options[0] : undefined;
  }
  const [enumSelection, setEnumSelection] = useState(dftValue);

  return (
    <FieldContainer
      {...(props as FieldBaseProps)}
      valueElement={() => (
        <DropdownButton size="sm" title={enumSelection ?? ""}>
          {props.options!.map((v, i) => (
            <Dropdown.Item
              key={i}
              eventKey={i.toString()}
              active={v === enumSelection}
              onClick={() => {
                setEnumSelection(v);
                if (props.onChange) {
                  props.onChange(v);
                }
              }}
            >
              {v}
            </Dropdown.Item>
          ))}
        </DropdownButton>
      )}
    />
  );
}
