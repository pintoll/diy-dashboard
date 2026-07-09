import { ListTodo } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { TodoTodayClient, type TodoTodayConfig } from "./ui/TodoTodayClient";

export type { TodoTodayConfig };

export const todoTodayWidget = defineWidget<TodoTodayConfig>({
  meta: {
    id: "todo-today",
    name: "Today's Todos",
    description: "Today's plan, overdue carry-overs, and the one todo you're working on",
    category: "productivity",
    icon: ListTodo,
    size: {
      minW: 3,
      minH: 3,
      maxW: 5,
      maxH: 6,
      defaultW: 3,
      defaultH: 4,
    },
  },
  defaultConfig: {},
  ClientComponent: TodoTodayClient,
});
