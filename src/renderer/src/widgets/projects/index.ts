import { Compass } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import { ProjectsClient, type ProjectsConfig } from "./ui/ProjectsClient";

export type { ProjectsConfig };

export const projectsWidget = defineWidget<ProjectsConfig>({
  meta: {
    id: "projects",
    name: "Projects",
    description: "Which projects are moving and which are rotting, with the next action on each",
    category: "productivity",
    icon: Compass,
    size: {
      minW: 3,
      minH: 2,
      maxW: 5,
      maxH: 6,
      defaultW: 3,
      defaultH: 3,
    },
  },
  defaultConfig: {},
  ClientComponent: ProjectsClient,
});
