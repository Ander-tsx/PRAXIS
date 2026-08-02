/** Forma mínima de tarea que alexa-service consume de tasks-service. */
export interface VoiceTask {
  id: string;
  title: string;
  status: string;
  boardId: string;
  columnId: string;
  assigneeId: string | null;
  reporterId: string;
  projectId: string;
  parentTaskId: string | null;
  priority: string;
  dueDate: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface VoiceProject {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface VoiceMember {
  id: string;
  name: string;
  email: string | null;
  roleName: string | null;
  isOwner: boolean;
}
