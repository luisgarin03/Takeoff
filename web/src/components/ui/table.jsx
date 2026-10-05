import React from "react";
import { cn } from "../../lib/cn.js";

const tablePart = (name, Tag) => React.forwardRef(function TablePart({ className, ...props }, ref) {
  return React.createElement(Tag, { ref, className: cn(`ui-table-${name}`, className), ...props });
});

export const Table = React.forwardRef(function Table({ className, ...props }, ref) {
  return <div className="ui-table-wrap"><table ref={ref} className={cn("ui-table", className)} {...props} /></div>;
});
export const TableHeader = tablePart("header", "thead");
export const TableBody = tablePart("body", "tbody");
export const TableRow = tablePart("row", "tr");
export const TableHead = tablePart("head", "th");
export const TableCell = tablePart("cell", "td");
