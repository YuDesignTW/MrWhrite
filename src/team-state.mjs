import { showcaseFiles, updateShowcaseFile } from "./workspace-demo.mjs";
export const STORAGE_KEY = "mrwhite-team-preview-v1";
export const members = [
  {
    id: "director",
    name: "總監",
    color: "#e3dfd7",
    role: "理解目標、安排分工、整合成果",
  },
  {
    id: "social",
    name: "社群經營",
    color: "#ee86ad",
    role: "帳號與平台內容管理",
  },
  {
    id: "analyst",
    name: "數據分析",
    color: "#a1a8bf",
    role: "成效整理與內容實驗",
  },
  {
    id: "designer",
    name: "設計圖面",
    color: "#6cc8a4",
    role: "視覺方向、輪播與版型",
  },
  {
    id: "writer",
    name: "文案寫手",
    color: "#b69ae8",
    role: "品牌故事與自然的繁體中文文案",
  },
  {
    id: "video",
    name: "影片製作團隊",
    color: "#e1b76b",
    role: "腳本、分鏡與製作規劃",
  },
  {
    id: "research",
    name: "趨勢偵查",
    color: "#7baae9",
    role: "議題研究與來源查核",
  },
];
export const skillCatalog = [
  {
    id: "copy-carousel",
    name: "輪播文案",
    text: "逐頁連貫敘事與貼文文案，依專案需求設定。",
    member: "writer",
  },
  {
    id: "ig-caption",
    name: "Instagram 文案",
    text: "貼文開場、內文與自然的行動邀請。",
    member: "writer",
  },
  {
    id: "ig-carousel",
    name: "輪播內容設計",
    text: "封面、逐頁敘事與畫面方向。",
    member: "designer",
  },
  {
    id: "ig-human",
    name: "自然語氣編輯",
    text: "修整制式句型，保留個人觀點。",
    member: "writer",
  },
  {
    id: "ig-plan",
    name: "社群內容企劃",
    text: "品牌方向、選題與內容節奏。",
    member: "director",
  },
  {
    id: "ig-audit",
    name: "內容成效分析",
    text: "依實際數據提出可驗證的改善方向。",
    member: "analyst",
  },
  {
    id: "ig-reel",
    name: "短影音分鏡",
    text: "口播、畫面文字與分鏡腳本。",
    member: "video",
  },
];
const id = () => globalThis.crypto.randomUUID();
export function createProject(name, brief = "") {
  return {
    id: id(),
    name: name.trim(),
    brief,
    memory: "",
    messages: [],
    resources: [],
    draft: "",
    recipient: "director",
  };
}
export function createTeam(name) {
  return {
    id: id(),
    name: name.trim(),
    type: "marketing",
    model: "Codex",
    skills: [],
    projects: [],
    activeProjectId: null,
  };
}
export function initialState() {
  const team = createTeam("行銷團隊");
  const project = createProject(
    "我的第一個專案",
    "請在此填寫專案目標、受眾、交付形式與限制。",
  );
  team.projects = [project];
  team.activeProjectId = project.id;
  return { version: 1, teams: [team], activeTeamId: team.id };
}
export function reducer(state, action) {
  if (action.type === "addTeam")
    return {
      ...state,
      teams: [...state.teams, action.team],
      activeTeamId: action.team.id,
    };
  if (action.type === "selectTeam")
    return state.teams.some((t) => t.id === action.id)
      ? { ...state, activeTeamId: action.id }
      : state;
  return {
    ...state,
    teams: state.teams.map((team) => {
      if (team.id !== action.teamId) return team;
      if (action.type === "patchTeam") return { ...team, ...action.patch };
      if (["updateShowcaseFile", "appendShowcaseFile"].includes(action.type))
        return {
          ...team,
          projects: team.projects.map((project) => {
            if (
              project.id !== action.projectId ||
              !["designer", "writer"].includes(action.role)
            )
              return project;
            const files = showcaseFiles(project, action.role);
            return {
              ...project,
              roleData: {
                ...project.roleData,
                [action.role]: {
                  ...project.roleData?.[action.role],
                  showcaseFiles:
                    action.type === "appendShowcaseFile"
                      ? [...files, action.item]
                      : updateShowcaseFile(files, action.id, action.patch),
                },
              },
            };
          }),
        };
      if (action.type === "addProject")
        return {
          ...team,
          projects: [...team.projects, action.project],
          activeProjectId: action.project.id,
        };
      if (action.type === "appendResources")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? {
                  ...project,
                  resources: [...project.resources, ...action.resources],
                }
              : project,
          ),
        };
      if (action.type === "patchRole")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? {
                  ...project,
                  roleData: {
                    ...project.roleData,
                    [action.role]: {
                      ...project.roleData?.[action.role],
                      ...action.patch,
                    },
                  },
                }
              : project,
          ),
        };
      if (action.type === "appendRoleItem")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? {
                  ...project,
                  roleData: {
                    ...project.roleData,
                    [action.role]: {
                      ...project.roleData?.[action.role],
                      [action.field]: [
                        ...(project.roleData?.[action.role]?.[action.field] ||
                          []),
                        action.item,
                      ],
                    },
                  },
                }
              : project,
          ),
        };
      if (action.type === "addTask")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? { ...project, tasks: [...(project.tasks || []), action.task] }
              : project,
          ),
        };
      if (action.type === "reviewTask")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? {
                  ...project,
                  tasks: (project.tasks || []).map((task) =>
                    task.id === action.taskId
                      ? { ...task, status: action.status }
                      : task,
                  ),
                }
              : project,
          ),
        };
      if (action.type === "handoff")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? {
                  ...project,
                  messages: [...project.messages, action.message],
                  recipient: "director",
                }
              : project,
          ),
        };
      if (action.type === "patchProject")
        return {
          ...team,
          projects: team.projects.map((project) =>
            project.id === action.projectId
              ? { ...project, ...action.patch }
              : project,
          ),
        };
      return team;
    }),
  };
}
export function parseState(raw) {
  const value = JSON.parse(raw);
  if (
    value.version !== 1 ||
    !Array.isArray(value.teams) ||
    !value.teams.length ||
    !value.teams.some((t) => t.id === value.activeTeamId)
  )
    throw Error("無法讀取先前的預覽資料。");
  for (const team of value.teams) {
    if (
      typeof team.name !== "string" ||
      !Array.isArray(team.skills) ||
      !Array.isArray(team.projects)
    )
      throw Error("團隊資料格式不完整。");
    for (const p of team.projects)
      if (
        typeof p.name !== "string" ||
        !Array.isArray(p.messages) ||
        !Array.isArray(p.resources)
      )
        throw Error("專案資料格式不完整。");
  }
  return value;
}

export function teamMembers(team){
 if(team?.blueprint)return [members[0],...team.blueprint.agents.map(agent => ({
   ...agent,
   name: ({ "輪播內容寫手": "文案寫手", "輪播內容編輯": "文案寫手", "產業研究員": "趨勢偵查", "輪播視覺設計師": "視覺設計師", "產業來源研究員": "趨勢偵查" })[agent.name] || agent.name,
 }))];
 if(team?.setup)return [members[0]];
 return members;
}
