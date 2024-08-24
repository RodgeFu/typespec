// import { Namespace } from "../core/types.js";

// type TypeGraphNodeType = "model" | "interface" | "enum" | "namespace" | "alias" | "operation" | "decorator" | "scalar" | "union" | "alias";
// interface typeGraphNode{
//   path: string;
//   name: string;
//   type: TypeGraphNodeType;
//   file: string;
//   pos: number;
//   end: number;
// }

// function createPath(parentPath?: string, type: typeGraphNode, name: string): string {
//   if (!parentPath) {
//     return `/${type}/${name}`;
//   }
//   return `${parentPath}/${type}/${name}`;
// }

// function createNamespaceNode(parentPath: string, namespace: Namespace): typeGraphNode{
//   return {
//     path: `${parentPath}/namespace/${namespace.name}`,

// function getTypeGraph(program: Program){
//   const globalNamespace = program.checker.getGlobalNamespaceType();
//   const allNamespaces = expandNamespaces(globalNamespace);

//   const nodes : typeGraphNode[] = [];

//   allNamespaces.forEach((n : Namespace) => {
//     nodes.push({
//       path: `/namespace/${n.name}`,
//       name: n.name,
//       type: "namespace"});
//     n.interfaces.forEach((i) => {});
//     n.models.forEach((m) => {});
//     n.decorators.forEach((d) => {});
//     n.enums.forEach((e) => {});
//     n.operations.forEach((o) => {});
//     n.unions.forEach((u) => {});
//     n.scalars.forEach((s) => {});
//   });
// }
