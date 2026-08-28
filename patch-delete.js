const fs = require('fs');
const path = 'apps/frontend/dashboard-front/src/components/organisms/DeleteAccount/DeleteAccount.tsx';
let code = fs.readFileSync(path, 'utf8');

const oldRender = `  if (!abierto) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setAbierto(true)}>
        Eliminar mi cuenta
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-sans text-sm font-semibold" style={{ color: colors.error }}>
        Esto no se puede deshacer.
      </p>
      <p className="font-sans text-xs text-text-secondary">
        Se borra tu cuenta y dejas de tener acceso a los proyectos donde estás. Lo que hayas escrito
        en un chat o comentado en una tarea sigue ahí, sin tu nombre. Los proyectos que sean tuyos
        no se borran con la cuenta: pásalos a otra persona antes si quieres que sigan.
      </p>

      <label htmlFor={campoId} className="font-sans text-xs text-text-secondary">
        Escribe <strong className="text-text-primary">{email}</strong> para confirmar
      </label>
      <Input
        id={campoId}
        value={confirmacion}
        onChange={(evento) => setConfirmacion(evento.target.value)}
        placeholder={email}
        autoComplete="off"
        disabled={borrando}
      />

      {error && (
        <p role="alert" className="font-sans text-xs" style={{ color: colors.error }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="danger"
          onClick={() => void eliminar()}
          /* Sin el correo exacto el botón no se puede pulsar: la comprobación
             se repite en el servidor, pero aquí evita el intento. */
          disabled={!coincide || borrando}
        >
          {borrando ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}
        </Button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setConfirmacion('');
            setError(null);
          }}
          disabled={borrando}
          className="cursor-pointer rounded-lg px-3 py-2 font-sans text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );`;

const newRender = `  return (
    <div className="flex flex-col sm:flex-row items-start gap-6">
      {!abierto ? (
        <Button type="button" variant="danger" size="sm" onClick={() => setAbierto(true)}>
          Eliminar mi cuenta
        </Button>
      ) : (
        <div className="flex flex-col gap-4 bg-white/5 border border-red-500/20 rounded-2xl p-4 sm:p-5 w-full sm:w-[420px] shadow-2xl relative">
          <div>
            <p className="font-sans text-[15px] font-bold text-red-400 mb-1">
              Esto no se puede deshacer.
            </p>
            <p className="font-sans text-[13px] text-white/50 leading-relaxed">
              Se borra tu cuenta y pierdes el acceso a los proyectos. Lo que hayas escrito
              sigue ahí, sin tu nombre.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={campoId} className="font-sans text-[13px] text-white/60">
              Escribe <strong className="text-white font-medium">{email}</strong> para confirmar
            </label>
            <input
              id={campoId}
              value={confirmacion}
              onChange={(evento) => setConfirmacion(evento.target.value)}
              placeholder={email}
              autoComplete="off"
              disabled={borrando}
              className="w-full bg-[#080807] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50"
            />
          </div>

          {error && (
            <p role="alert" className="font-sans text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void eliminar()}
              disabled={!coincide || borrando}
              className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:bg-white/5 disabled:text-white/20 px-4 py-2 rounded-xl text-sm font-bold transition-all"
            >
              {borrando ? 'Eliminando…' : 'Eliminar cuenta'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                setConfirmacion('');
                setError(null);
              }}
              disabled={borrando}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white/50 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );`;

code = code.replace(oldRender, newRender);
fs.writeFileSync(path, code);
