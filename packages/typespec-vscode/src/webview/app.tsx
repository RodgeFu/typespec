import { SwaggerUIWrapper } from "@typespec/typespec-ide-ui-react";
import React, { useEffect, useState } from "react";
import "./app.scss";
import "./bootstrap-vscode.scss";

function App(): React.ReactElement {
  //const context = useStandalonePlaygroundContext(config);

  //return <><FieldString name="label1" defaultValue="hahaha" onChange={()=>{}}></FieldString></>
  const [spec, setSpec] = useState("");
  const [diagnostics, setDiagnostics] = useState("");

  useEffect(() => {
    window.addEventListener("message", (event) => {
      const message = event.data; // The JSON data our extension sent

      switch (message.command) {
        case "load":
          setSpec(message.param);
          setDiagnostics("");
          break;
        case "diagnostics":
          setSpec("");
          setDiagnostics(message.param);
          break;
      }
    });
  }, []);

  return (
    <>
      <div hidden={diagnostics !== "" || spec !== ""}>Loading...</div>
      <pre lang="json" hidden={diagnostics === ""}>
        {diagnostics}
      </pre>
      <div hidden={spec === ""}>
        <SwaggerUIWrapper spec={spec} />
      </div>
    </>
  );
}

export default App;
