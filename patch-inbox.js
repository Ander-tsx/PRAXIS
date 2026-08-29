const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppShell.tsx';
let code = fs.readFileSync(path, 'utf8');

const regex = /function SidebarInboxList\(\{ zonePath, plegada \}: \{ zonePath: string; plegada: boolean \}\) \{[\s\S]*?\n\}\n/m;

const replacement = `function SidebarInboxList({ zonePath, plegada }: { zonePath: string; plegada: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(\`\${zonePath}/api/gateway/me/notifications?limit=20\`)
      .then(res => res.json())
      .then(body => {
        const list = body?.data?.items || [];
        setItems(list);
        
        const ids = [...new Set(list.map((i: any) => i.actorId).filter((id: any) => !!id))];
        if (ids.length > 0) {
          fetch(\`\${zonePath}/api/gateway/users?ids=\${ids.join(',')}\`)
            .then(r => r.json())
            .then(ubody => {
              const uMap: Record<string, any> = {};
              (ubody?.data?.items || ubody?.data || []).forEach((u: any) => uMap[u.id] = u);
              setUsersMap(uMap);
            })
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [zonePath]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-white/40 text-[13px] font-sans">
        Nada nuevo por aquí.
      </div>
    );
  }

  function getTitle(n: any) {
    const who = n.actorId ? (usersMap[n.actorId]?.name?.split(' ')[0] || 'Alguien') : 'El sistema';
    const project = n.projectName ?? 'un proyecto';
    const task = n.taskTitle ?? 'una tarea';

    switch (n.type) {
      case 'INVITATION_RECEIVED': return \`\${who} te invitó a \${project}\`;
      case 'INVITATION_ACCEPTED': return \`\${who} aceptó tu invitación a \${project}\`;
      case 'INVITATION_REJECTED': return \`\${who} rechazó tu invitación a \${project}\`;
      case 'MEMBER_LEFT': return \`\${who} salió de \${project}\`;
      case 'MEMBER_REMOVED': return \`\${who} te sacó de \${project}\`;
      case 'TASK_ASSIGNED': return \`\${who} te asignó \${task} en \${project}\`;
      case 'TASK_UNASSIGNED': return \`\${who} te quitó de \${task} en \${project}\`;
      case 'AUTOMATION_TASK_DUE_SOON': return \`\${task} vencerá pronto en \${project}\`;
      case 'AUTOMATION_TASK_STALE': return \`\${task} lleva días sin movimiento en \${project}\`;
      case 'AUTOMATION_TASK_OVERDUE': return \`\${task} ha vencido en \${project}\`;
      case 'AUTOMATION_TASK_UNASSIGNED': return \`\${task} sigue sin encargado en \${project}\`;
      case 'AUTOMATION_TASK_CREATED': return \`Se creó \${task} en \${project}\`;
      case 'AUTOMATION_TASK_MOVED': return \`\${task} cambió de columna en \${project}\`;
      case 'AUTOMATION_TASK_COMPLETED': return \`\${task} se terminó en \${project}\`;
      case 'AUTOMATION_TASK_REOPENED': return \`\${task} se reabrió en \${project}\`;
      case 'AUTOMATION_TASK_ASSIGNEES_CHANGED': return \`Cambiaron los encargados de \${task}\`;
      case 'AUTOMATION_TASK_DUE_DATE_CHANGED': return \`Cambió el vencimiento de \${task}\`;
      default: return 'Nueva notificación';
    }
  }

  function getHref(n: any) {
    if (!n.projectId || n.type === 'MEMBER_REMOVED') return \`\${zonePath}\`;
    if (n.taskId) return \`\${zonePath}/projects/\${n.projectId}?task=\${n.taskId}\`;
    return \`\${zonePath}/projects/\${n.projectId}\`;
  }

  return (
    <div className="flex flex-col gap-1 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-none px-1">
      {items.map((n: any) => {
        const actor = n.actorId ? usersMap[n.actorId] : null;
        return (
          <a
            key={n.id}
            href={getHref(n)}
            className={\`relative flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/5 \${
              !n.readAt ? 'bg-white/[0.03]' : ''
            }\`}
          >
            {!plegada && (
              <div className="w-8 h-8 shrink-0 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                {actor?.avatarSrc ? (
                  <img src={actor.avatarSrc} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[11px] font-bold">
                    {(actor?.name || 'S').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <div className={\`flex flex-col min-w-0 flex-1 \${plegada ? 'hidden' : ''}\`}>
              <p className={\`font-sans text-[12px] leading-snug line-clamp-2 \${!n.readAt ? 'text-white font-medium' : 'text-white/60'}\`}>
                {getTitle(n)}
              </p>
              <span className="font-sans text-[10px] text-white/30 mt-1">
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </div>
            {!n.readAt && (
              <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
            )}
          </a>
        );
      })}
    </div>
  );
}
`;

code = code.replace(regex, replacement);
fs.writeFileSync(path, code);
