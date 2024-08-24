import Path from "../Path";
import { FieldBaseProps } from "./Field";
import FieldContainer from "./FieldContainer";

export interface FieldPathProps extends FieldBaseProps {
  path: string;
}

export default function FieldPath(fieldPathProps: FieldPathProps) {
  return (
    <FieldContainer
      {...(fieldPathProps as FieldBaseProps)}
      valueElement={() => <Path path={fieldPathProps.path}></Path>}
    ></FieldContainer>
  );
}
