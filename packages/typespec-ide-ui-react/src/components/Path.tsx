interface PathProps {
  path: string;
}

const PATH_SEG_SEP = ":";
export interface PathSeg {
  name: string;
  type: "plain-text" | "param";
  value?: string;
}

function Path({ path }: PathProps) {
  const pathSegs: PathSeg[] = path
    .split("/")
    .filter((p) => p.length > 0)
    .map((p) => {
      if (p.startsWith("{") && p.endsWith("}")) {
        const paramNameValue = p.substring(1, p.length - 1);
        const [paramName, paramValue] = paramNameValue.split(PATH_SEG_SEP);
        if (paramValue) {
          return {
            name: paramName,
            type: "param",
            value: paramValue,
          };
        } else {
          return {
            name: paramName,
            type: "param",
          };
        }
      } else {
        return {
          name: p,
          type: "plain-text",
        };
      }
    });
  return (
    <div>
      {pathSegs.map((p, i) => {
        if (p.type === "param") {
          return (
            <>
              <label>/</label>
              <label key={i} className="param-in-path" title={p.name}>
                {p.value ?? `{${p.name}}`}
              </label>
            </>
          );
        } else {
          return <label key={i}>/{p.name}</label>;
        }
      })}
    </div>
  );
}

export default Path;
