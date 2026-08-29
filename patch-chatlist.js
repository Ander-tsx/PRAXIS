const fs = require('fs');
const path = 'apps/frontend/commons/organisms/AppLayout/AppShell.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Add imports at the top
const importsRegex = /import \{ useMessageCount \} from '\.\.\/\.\.\/realtime\/useMessageCount';/;
code = code.replace(importsRegex, `import { useMessageCount } from '../../realtime/useMessageCount';
import { ProjectMonogram } from '../../atoms/ProjectMonogram';
import { usePresence } from '../../realtime/presence';
import { avatarHref } from '../../api/presence';
import { personLabel } from '../../api/domain';`);

// 2. Persist activeTab in localStorage
const tabStateRegex = /const \[activeTab, setActiveTab\] = useState\<'home' \| 'chat' \| 'inbox'\>\('home'\);/;
code = code.replace(tabStateRegex, `const [activeTab, setActiveTab] = useState<'home' | 'chat' | 'inbox'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('praxis:sidebarTab');
      if (stored === 'chat' || stored === 'inbox') return stored;
    }
    return 'home';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('praxis:sidebarTab', activeTab);
    }
  }, [activeTab]);`);

// 3. Completely replace SidebarChatList
const chatListRegex = /function SidebarChatList\(\{ zonePath, plegada \}: \{ zonePath: string; plegada: boolean \}\) \{[\s\S]*?\n\}\n/m;
const newChatList = `
function SidebarChatList({ zonePath, plegada }: { zonePath: string; plegada: boolean }) {
  const pathname = usePathname();
  const [directs, setDirects] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(\`\${zonePath}/api/gateway/me/chats\`).then(res => res.json()).catch(() => ({ data: [] })),
      fetch(\`\${zonePath}/api/gateway/me/chats/projects\`).then(res => res.json()).catch(() => ({ data: [] }))
    ]).then(([d, p]) => {
      const listD = Array.isArray(d?.data) ? d.data : [];
      const listP = Array.isArray(p?.data) ? p.data : [];
      setDirects(listD);
      setProjects(listP);

      const ids = new Set<string>();
      listD.forEach((c: any) => c.peerId && ids.add(c.peerId));
      listP.forEach((c: any) => c.ultimo?.authorId && ids.add(c.ultimo.authorId));

      if (ids.size > 0) {
        fetch(\`\${zonePath}/api/gateway/users?ids=\${Array.from(ids).join(',')}\`)
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
    });
  }, [zonePath]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-10 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  function resumenDe(mensaje: { body: string; deletedAt?: string | null }): string {
    if (mensaje.deletedAt) return 'Mensaje eliminado';
    return mensaje.body.replace(/<[^>]*>?/gm, '').substring(0, 50) + (mensaje.body.length > 50 ? '...' : '');
  }

  function cuandoCorto(iso: string) {
    const d = new Date(iso);
    const ahora = new Date();
    if (d.getDate() === ahora.getDate() && d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  }

  const PersonRow = ({ c, peer }: any) => {
    const presencia = usePresence(c.peerId, peer?.presence);
    const nombre = peer ? personLabel(peer) : 'Alguien';
    const link = \`/chat/\${c.peerId}\`;
    const activo = pathname === link;

    return (
      <a
        key={c.peerId || c.channelId}
        href={link}
        aria-current={activo ? 'page' : undefined}
        className={\`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/10 \${plegada ? 'justify-center px-0' : ''} \${activo ? 'bg-white/10' : ''}\`}
      >
        <div className="shrink-0">
          <Avatar
            label={nombre}
            size="sm"
            src={avatarHref(peer?.avatarUrl, \`\${zonePath}/api/gateway\`)}
            presence={presencia}
          />
        </div>
        {!plegada && (
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={\`truncate font-sans text-[13px] font-medium \${activo ? 'text-white' : 'text-white/90'}\`}>
                {nombre}
              </span>
              {c.ultimo && (
                <span className="ml-auto shrink-0 font-sans text-[10px] text-white/40">
                  {cuandoCorto(c.ultimo.createdAt)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className={\`truncate font-sans text-[11px] \${!c.ultimo && !activo ? 'text-white/30' : 'text-white/50'}\`}>
                {c.ultimo ? resumenDe(c.ultimo) : 'Iniciar conversación'}
              </span>
              {c.unread > 0 && (
                <span className="min-w-[18px] rounded-full bg-primary px-1.5 py-0.5 text-center font-sans text-[9px] font-semibold text-primary-foreground shrink-0">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </div>
          </div>
        )}
      </a>
    );
  };

  const ProjectRow = ({ c, autor }: any) => {
    const link = \`/chat/proyecto/\${c.project.id}\`;
    const activo = pathname === link;

    return (
      <a
        key={c.project.id}
        href={link}
        aria-current={activo ? 'page' : undefined}
        className={\`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/10 \${plegada ? 'justify-center px-0' : ''} \${activo ? 'bg-white/10' : ''}\`}
      >
        <div className="shrink-0 flex items-center justify-center scale-90 origin-center">
          <ProjectMonogram id={c.project.id} name={c.project.name} />
        </div>
        {!plegada && (
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={\`truncate font-sans text-[13px] font-medium \${activo ? 'text-white' : 'text-white/90'}\`}>
                {c.project.name}
              </span>
              {c.ultimo && (
                <span className="ml-auto shrink-0 font-sans text-[10px] text-white/40">
                  {cuandoCorto(c.ultimo.createdAt)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className={\`truncate font-sans text-[11px] \${!c.ultimo && !activo ? 'text-white/30' : 'text-white/50'}\`}>
                {c.ultimo ? \`\${autor ? personLabel(autor) : 'Alguien'}: \${resumenDe(c.ultimo)}\` : 'Sin mensajes'}
              </span>
              {c.unread > 0 && (
                <span className="min-w-[18px] rounded-full bg-primary px-1.5 py-0.5 text-center font-sans text-[9px] font-semibold text-primary-foreground shrink-0">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </div>
          </div>
        )}
      </a>
    );
  };

  return (
    <div className="flex flex-col gap-4 max-h-[calc(100vh-200px)] overflow-y-auto scrollbar-none pb-4 px-1">
      {projects.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {!plegada && <span className="mx-1 px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-white/50">Proyectos</span>}
          {projects.map((c: any) => (
            <ProjectRow key={c.project.id} c={c} autor={c.ultimo?.authorId ? usersMap[c.ultimo.authorId] : null} />
          ))}
        </div>
      )}

      {directs.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {!plegada && <span className="mx-1 px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-white/50">Privados</span>}
          {directs.map((c: any) => (
            <PersonRow key={c.peerId} c={c} peer={usersMap[c.peerId]} />
          ))}
        </div>
      )}
    </div>
  );
}
`;

code = code.replace(chatListRegex, newChatList);

fs.writeFileSync(path, code);
