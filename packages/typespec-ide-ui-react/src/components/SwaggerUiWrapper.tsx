import SwaggerUI from "swagger-ui-react"
import "swagger-ui-react/swagger-ui.css"

export default function SwaggerUIWrapper({url, spec} : {url?: string, spec?: string}){
    return (<div><SwaggerUI url={url} spec={spec} /></div>)
}
