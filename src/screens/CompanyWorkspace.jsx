// Área de trabalho de uma empresa (cabeçalho, abas, vistas, modais e relatório de impressão).
// Extraído do `return` final de AppScreens (src/App.jsx) em 2026-10-17 ("dividir o AppScreens e o S"): carregado sob demanda. O JSX é o mesmo de antes;
// tudo o que ele usava do AppScreens (estado, funções, valores calculados) chega no objeto `ctx`, montado a cada render com os valores atuais.
import { ArchiveRestore, History, CalendarCheck, Share2, ShieldCheck, Briefcase, Building2, CalendarDays, Clock, Columns3, FileSpreadsheet, FileText, Gauge, LayoutGrid, List, ListChecks, Mic, MoreHorizontal, Network, Pause, Plus, Settings, Trash2, Undo2, Upload, X } from 'lucide-react';
import { MeetingPrintReport } from '../meetings/MeetingDetail.jsx';
import { MeetingsView } from '../meetings/Meetings.jsx';
import { ProjectAssistant } from '../assistant/ProjectAssistant.jsx';
import React from 'react';
import { lazyRetry } from '../lib/lazyRetry.jsx';
import { S } from '../styles/S.js';
import SafeBoundary from '../ui/SafeBoundary.jsx';
import { buildActivityOptions, taskCountsByActivity } from '../meetings/ActivityLink.jsx';
import { AreaRow, CLIENT_TYPE_META, CLIENT_TYPE_ORDER, COMPANY_STATUS_META, CompanySectionHeader, CreateCompanyModal, GroupActivityCompaniesModal, PhaseRow, SidePanel, TeamLinkBadge, ToastStack, TodoBoardView, fmtDate, fmtTs, todayISOStr, useMediaQuery } from '../App.jsx';
import { KanbanView, PhasesView, ResumoView, TableView, TimelineView } from './CompanyViews.jsx';
import { PrintReport } from '../pdf/PrintReport.jsx';
import { PdfExportModal } from '../pdf/PdfExportModal.jsx';
import { AutoDatesToggle } from './AutoDates.jsx';
import MapView from './MapView.jsx';
import CompanyTriage from './CompanyTriage.jsx';
import { ScreenSearchBox, ScreenSearchNote } from './ScreenSearch.jsx';
import { countLiveItems, filterActivities, filterMeetings, filterTodoMeetings, queryTerms } from '../lib/screenSearch.js';

const StandardAuditModal = lazyRetry(() => import('../macro/StandardAudit.jsx'));
const CompanyShareLinkModal = lazyRetry(() => import('./CompanyShareLink.jsx'));
const CompanyCalendarModal = lazyRetry(() => import('./CompanyCalendar.jsx'));
const StandardPlanBar = lazyRetry(() => import('../macro/StandardPlanBar.jsx'));
const VersionHistoryModal = lazyRetry(() => import('../versions/VersionHistory.jsx'));
const DeletedCompaniesModal = lazyRetry(() => import('../versions/VersionHistory.jsx').then((m) => ({ default: m.DeletedCompaniesModal })));

export function CompanyWorkspace({ ctx }) {
  const {
    actingOrg,
    activeProject,
    activitiesSorted,
    addActivity,
    addAreaRow,
    addAttachment,
    addGroupWideActivity,
    addLog,
    addMeeting,
    addMeetingActionItem,
    addMember,
    addPhase,
    addSub,
    addTodoAttachment,
    addTodoComment,
    addTodoSubtask,
    appToasts,
    canLinkTasks,
    canPickCompanies,
    closeActivityDetail,
    closeMeetingDetail,
    commitAreaRow,
    commitMemberArea,
    currentUser,
    deleteActivity,
    deleteMeetingActionItem,
    deletePhase,
    deleteSub,
    deleteTodoAttachment,
    deleteTodoComment,
    deleteTodoSubtask,
    dismissAppToast,
    dragId,
    dragPhaseId,
    duplicateActionItem,
    exitOrganization,
    expanded,
    exportExcel,
    exportPdf,
    pdfDialog,
    setPdfDialog,
    pdfOptions,
    confirmPdfExport,
    fileInputRef,
    goToCompanySelector,
    goToOrgAdmin,
    goToWorkspace,
    granularity,
    groupInfo,
    guardModal,
    handleCreateCompanyPayload,
    handleLogoUpload,
    isGroupView,
    isMobile,
    isMulti,
    linkArea,
    linkMember,
    linkTaskToActivity,
    linkUserId,
    meetingToPrint,
    moreMenuItems,
    multiActivities,
    mutateProject,
    newMember,
    openActivityDetail,
    openActivityId,
    openMeetingDetail,
    openMeetingId,
    openProjectInCrm,
    orderMap,
    organizations,
    perCompanyOrderMap,
    perCompanySorted,
    phasesEditingProjectId,
    pid,
    projects,
    pushAppUndoToast,
    reloadProjects,
    flushProjectSave,
    setShowVersions,
    showVersions,
    setShowDeletedCompanies,
    showDeletedCompanies,
    removeAreaRow,
    removeAttachment,
    removeMember,
    renderActivityDetailModal,
    renderMeetingDetailModal,
    reorderPhase,
    reorderSub,
    linkPautaTo,
    requestTaskSuggestions,
    resetTaskLinks,
    restoreActivity,
    restoreMeeting,
    restoreSub,
    selectedGroupRoots,
    selectedProjects,
    stdInfo,
    stdPlanActions,
    setDragId,
    setDragPhaseId,
    setExpanded,
    setGranularity,
    setLinkArea,
    setLinkUserId,
    setNewMember,
    setPhasesEditingProjectId,
    setShowCreateCompany,
    setShowGroupActivityModal,
    setShowLog,
    setShowMeetingsTrash,
    setShowMoreMenu,
    setShowPhases,
    setShowSettings,
    setShowTrash,
    setTodoFocusActivityId,
    openActivityTasks,
    openLinkedMeeting,
    setTodoFocusMeetingId,
    setView,
    setWindowAnchor,
    showCreateCompany,
    showGroupActivityModal,
    showLog,
    showAudit,
    setShowAudit,
    showShareLink,
    setShowShareLink,
    showCalendarBlock,
    setShowCalendarBlock,
    showMeetingsTrash,
    showMoreMenu,
    showPhases,
    showSettings,
    showTrash,
    teamCandidates,
    todoFocusActivityId,
    todoFocusMeetingId,
    toggleTodoSubtask,
    updateActivity,
    updateAreaRow,
    updateCompanyFields,
    updateMeetingActionItem,
    updateMemberArea,
    updatePhase,
    updateSub,
    updateTodoComment,
    view,
    windowAnchor,
  } = ctx;
  // Cronograma padrão aberto na tela de empresa (2026-10-19): sem dados de empresa, reuniões, tarefas de reunião, auditoria nem RENATA; a faixa de versões fica no alto.
  const isTpl = !!activeProject && activeProject.id === 'std-plan';
  const multiTaskCounts = isMulti ? Object.fromEntries(selectedProjects.map((p) => [p.id, taskCountsByActivity(p.meetings)])) : null;

  // Busca da tela aberta (2026-10-19): um texto POR ABA (trocar de aba não leva o filtro junto) e zerado ao trocar de empresa.
  const searchScope = isMulti ? selectedProjects.map((p) => p.id).join(',') : (activeProject ? activeProject.id : '');
  const [searches, setSearches] = React.useState({});
  React.useEffect(() => { setSearches({}); }, [searchScope]);
  const wideTabs = useMediaQuery('(min-width: 1180px)');
  const searchQ = searches[view] || '';
  const setSearchQ = (v) => setSearches((prev) => ({ ...prev, [view]: v }));
  const searching = queryTerms(searchQ).length > 0;
  const liveActs = (list) => (list || []).filter((a) => !a.deleted);
  const shownActs = !isMulti && activeProject ? filterActivities(activitiesSorted, searchQ, activeProject.phases, orderMap) : activitiesSorted;
  const shownMulti = isMulti ? filterActivities(multiActivities, searchQ, null, null) : multiActivities;
  const shownPer = isMulti && searching
    ? Object.fromEntries(selectedProjects.map((p) => [p.id, filterActivities(perCompanySorted[p.id] || [], searchQ, p.phases, perCompanyOrderMap[p.id])]))
    : perCompanySorted;
  const shownMeetings = !isMulti && activeProject && view === 'meetings' ? filterMeetings(activeProject.meetings || [], searchQ) : (activeProject ? activeProject.meetings || [] : []);
  const shownTodoMeetings = !isMulti && activeProject && view === 'todo' ? filterTodoMeetings(activeProject.meetings || [], searchQ) : (activeProject ? activeProject.meetings || [] : []);
  const searchInfo = (() => {
    if (view === 'meetings') return { placeholder: 'Buscar reuniões', noun: { one: 'reunião', many: 'reuniões', fem: true }, total: (activeProject?.meetings || []).filter((m) => !m.deleted).length, shown: shownMeetings.filter((m) => !m.deleted).length };
    if (view === 'todo') return { placeholder: 'Buscar tarefas', noun: { one: 'tarefa', many: 'tarefas', fem: true }, total: countLiveItems(activeProject?.meetings), shown: countLiveItems(shownTodoMeetings) };
    const total = isMulti ? liveActs(multiActivities).length : liveActs(activitiesSorted).length;
    const shown = isMulti ? liveActs(shownMulti).length : liveActs(shownActs).length;
    return { placeholder: 'Buscar atividades', noun: { one: 'atividade', many: 'atividades', fem: true }, total, shown };
  })();

  return (
    <div className="page-root" style={S.page}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], input[type=password], input[type=number], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, input[type=number]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=checkbox]{ accent-color:#F5C400; width:15px; height:15px; }
        ::-webkit-scrollbar{ height:8px; width:8px; }
        ::-webkit-scrollbar-thumb{ background:var(--border-3); border-radius:4px; }
        @media print {
          .no-print { display:none !important; }
          * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
        }
      `}</style>

      {actingOrg && (
        <div className="no-print acting-org-banner" style={S.actingOrgBanner}>
          <Building2 size={13} /> Super Admin — visualizando como <strong>{actingOrg.name}</strong>
          <button style={S.actingOrgExitBtn} onClick={exitOrganization}>Sair da organização</button>
        </div>
      )}

      <div className="no-print t44" style={S.topbar}>
        <div style={S.brandRow}>
          {isMulti ? (
            <>
              <div style={S.logoPlaceholder}><LayoutGrid size={18} color="#F5C400" /></div>
              <div>
                <div style={S.brandName}>Visão geral — {selectedProjects.length} empresas</div>
                <div style={S.multiCompanyChips}>
                  {selectedProjects.map((p) => (
                    <span key={p.id} style={{ ...S.multiCompanyChip, borderColor: p.company.color || 'var(--border-3)' }}>
                      <span style={{ ...S.companyColorDot, background: p.company.color || 'var(--text-8)' }} />
                      {p.company.nomeFantasia || p.company.name || 'Sem nome'}
                      {p.company.clientType && CLIENT_TYPE_META[p.company.clientType] ? ` · ${CLIENT_TYPE_META[p.company.clientType].short}` : ''}
                      {(p.company.status || 'ativo') === 'pausado' ? ' ⏸' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {isTpl ? <div style={S.logoPlaceholder}><ListChecks size={18} color="#F5C400" /></div> : activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoImg} /> : <div style={S.logoPlaceholder}><Building2 size={18} color={activeProject.company.color || '#F5C400'} /></div>}
              <div>
                <div style={S.brandNameRow}>
                  <div style={S.brandName}>{activeProject.company.nomeFantasia || activeProject.company.name || 'Cliente não cadastrado'}</div>
                  {activeProject.company.clientType && CLIENT_TYPE_META[activeProject.company.clientType] && (
                    <span style={{ ...S.companyStatusPill, color: CLIENT_TYPE_META[activeProject.company.clientType].color, background: CLIENT_TYPE_META[activeProject.company.clientType].bg, borderColor: CLIENT_TYPE_META[activeProject.company.clientType].border }}>
                      {CLIENT_TYPE_META[activeProject.company.clientType].label}
                    </span>
                  )}
                  {(activeProject.company.status || 'ativo') === 'pausado' && (
                    <span style={{ ...S.companyStatusPill, display: 'inline-flex', alignItems: 'center', gap: 4, color: COMPANY_STATUS_META.pausado.color, background: COMPANY_STATUS_META.pausado.bg, borderColor: COMPANY_STATUS_META.pausado.border }}>
                      <Pause size={10} /> Pausado{activeProject.company.resumeDate ? ` · retoma ${fmtDate(activeProject.company.resumeDate)}` : ''}
                    </span>
                  )}
                </div>
                {activeProject.company.nomeFantasia && activeProject.company.name && activeProject.company.nomeFantasia !== activeProject.company.name && (
                  <div style={S.brandSecondary}>{activeProject.company.name}</div>
                )}
                <div style={S.brandCnpj}>
                  {isTpl ? 'Modelo que as empresas novas seguem' : activeProject.company.cnpj ? `CNPJ ${activeProject.company.cnpj}` : 'CNPJ não informado'}
                  {!isTpl && activeProject.company.regimeTributario ? ` · ${activeProject.company.regimeTributario}` : ''}
                </div>
              </div>
              {!isMobile && !isTpl && <button style={S.iconBtn} onClick={() => setShowSettings(true)}><Settings size={15} /> Empresa</button>}
              {!isMobile && !isTpl && currentUser.crmAccess && <button style={S.iconBtn} onClick={openProjectInCrm} title="Abrir esta empresa no CRM"><Briefcase size={15} /> Abrir no CRM</button>}
            </>
          )}
          {!isMobile && canPickCompanies && !isTpl && (
            <button style={S.iconBtn} onClick={() => goToCompanySelector()}><Building2 size={15} /> Trocar empresas</button>
          )}
        </div>
        <div style={S.actionsRow}>
          {isMobile && moreMenuItems.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button style={S.iconBtn} onClick={() => setShowMoreMenu((v) => !v)}><MoreHorizontal size={15} /> Mais</button>
              {showMoreMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setShowMoreMenu(false)} />
                  <div style={{ ...S.dropdownMenu, left: 0, right: 'auto' }}>
                    {moreMenuItems.map((item, i) => (
                      <button key={i} style={S.dropdownItem} onClick={() => { setShowMoreMenu(false); item.onClick(); }}>
                        <item.icon size={14} /> {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {!isMobile && !isTpl && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowCreateCompany(true)}><Plus size={15} /> Cadastrar empresa</button>
          )}
          {!isMobile && !isTpl && currentUser.role === 'master' && (
            <button style={S.iconBtn} onClick={() => setShowDeletedCompanies(true)}><ArchiveRestore size={15} /> Empresas excluídas</button>
          )}
          {!isMobile && !isTpl && currentUser.isSuperAdmin && <button style={S.iconBtn} onClick={() => goToOrgAdmin(true)}><Building2 size={15} /> Organizações</button>}
          {!isMobile && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => { setPhasesEditingProjectId(activeProject.id); setShowPhases(true); }}><LayoutGrid size={15} /> Fases</button>
          )}
          {!isMobile && !isMulti && !isTpl && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <>
              <button style={S.iconBtn} onClick={() => setShowShareLink(true)}><Share2 size={15} /> Link para o cliente</button>
              <button style={S.iconBtn} onClick={() => setShowCalendarBlock(true)}><CalendarDays size={15} /> Reservar na agenda</button>
            </>
          )}
          {!isMobile && !isMulti && !isTpl && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowAudit(true)}><ShieldCheck size={15} /> Auditoria</button>
          )}
          {!isMobile && !isMulti && !isTpl && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowLog(true)}><Clock size={15} /> Log ({(activeProject.log || []).length})</button>
          )}
          {!isMobile && !isMulti && !isTpl && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowVersions(true)}><History size={15} /> Versões</button>
          )}
          {!isMobile && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
            <button style={S.iconBtn} onClick={() => setShowTrash(true)}><Trash2 size={15} /> Lixeira ({activeProject.activities.filter((a) => a.deleted).length + activeProject.activities.reduce((n, a) => n + (a.deleted ? 0 : (a.subactivities || []).filter((s) => s.deleted).length), 0)})</button>
          )}
          {!isMobile && <button style={S.iconBtn} onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>}
          {!isMobile && <button style={S.iconBtn} onClick={exportPdf}><FileText size={15} /> PDF</button>}
          {isGroupView ? (
            <button style={S.primaryBtn} onClick={() => setShowGroupActivityModal(true)}><Plus size={15} /> Nova atividade</button>
          ) : isMulti ? (
            <select
              style={{ ...S.iconBtn, cursor: 'pointer', appearance: 'auto' }}
              value=""
              onChange={(e) => { if (e.target.value) addActivity(e.target.value); e.target.value = ''; }}
            >
              <option value="">+ Nova atividade em...</option>
              {selectedProjects.map((p) => <option key={p.id} value={p.id}>{p.company.nomeFantasia || p.company.name || 'Sem nome'}</option>)}
            </select>
          ) : (
            <button style={S.primaryBtn} onClick={() => addActivity(activeProject.id)}><Plus size={15} /> Nova atividade</button>
          )}
        </div>
      </div>

      {isTpl && (
        <SafeBoundary variant="block" resetKey="stdplan-bar" label="a faixa do cronograma padrão" where="stdplan-bar">
          <React.Suspense fallback={null}><StandardPlanBar info={stdInfo} project={activeProject} actions={stdPlanActions} /></React.Suspense>
        </SafeBoundary>
      )}

      <div className="no-print t44" style={S.tabs}>
        {[
          !isMulti && { id: 'resumo', label: 'Resumo', icon: Gauge },
          !isMulti && !isTpl && { id: 'meetings', label: 'Reuniões', icon: Mic },
          !isMulti && !isTpl && { id: 'todo', label: 'Tarefas', icon: ListChecks },
          { id: 'timeline', label: 'Gantt', icon: CalendarDays },
          { id: 'table', label: 'Tabela', icon: List },
          { id: 'phases', label: 'Fases', icon: LayoutGrid },
          { id: 'kanban', label: 'Quadro', icon: Columns3 },
          !isMulti && { id: 'mapa', label: 'Mapa', icon: Network },
          !isMulti && !isTpl && { id: 'triagem', label: 'Triagem', icon: CalendarCheck },
        ].filter(Boolean).map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setView(t.id)} style={{ ...S.tab, ...(view === t.id ? S.tabActive : {}) }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
        {wideTabs && <div style={{ marginLeft: 'auto', paddingLeft: 12, alignSelf: 'center' }}><ScreenSearchBox value={searchQ} onChange={setSearchQ} placeholder={searchInfo.placeholder} /></div>}
      </div>
      {!wideTabs && <div className="no-print" style={{ padding: isMobile ? '10px 12px 0' : '10px 24px 0', display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end' }}><ScreenSearchBox value={searchQ} onChange={setSearchQ} placeholder={searchInfo.placeholder} /></div>}

      <main className="no-print" style={{ ...S.main, ...(isMobile ? { padding: `14px 12px ${isMulti ? 0 : 64}px 12px` } : null) }}>
        <ScreenSearchNote value={searchQ} shown={searchInfo.shown} total={searchInfo.total} noun={searchInfo.noun} onClear={() => setSearchQ('')} />
        {!isMulti && activeProject && ['table', 'timeline', 'phases', 'kanban'].includes(view) && <AutoDatesToggle pid={activeProject.id} />}
        <SafeBoundary resetKey={`company:${view}:${isMulti ? 'multi' : (activeProject ? activeProject.id : '')}`} label="esta aba" where="company-view" actions={isMulti && view === 'table' ? undefined : (view === 'table' ? [{ label: 'Ir para o Resumo', onClick: () => setView('resumo') }] : [{ label: 'Ir para a Tabela', onClick: () => setView('table') }])}>
        <React.Suspense fallback={<div style={S.emptyMuted}>Carregando…</div>}>
        {!isMulti && view === 'resumo' && (
          <ResumoView
            activities={shownActs}
            orderMap={orderMap}
            phases={activeProject.phases}
            pid={activeProject.id}
            openDetail={openActivityDetail}
            companyColor={activeProject.company.color}
            taskCounts={taskCountsByActivity(activeProject.meetings)}
            onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }}
          />
        )}
        {!isMulti && view === 'meetings' && (
          <MeetingsView
            meetings={shownMeetings}
            team={activeProject.team}
            pid={activeProject.id}
            companyName={activeProject.company.nomeFantasia || activeProject.company.name || ''}
            canDossier={!!currentUser && (currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax')}
            onAdd={() => addMeeting(activeProject.id)}
            onOpen={(id) => openMeetingDetail(activeProject.id, id)}
            showTrash={showMeetingsTrash}
            onShowTrash={() => setShowMeetingsTrash(true)}
            onHideTrash={() => setShowMeetingsTrash(false)}
            onRestore={(id) => restoreMeeting(activeProject.id, id)}
            onReloadProjects={reloadProjects}
          />
        )}
        {!isMulti && view === 'todo' && (
          <React.Suspense fallback={<div style={S.emptyMuted}>Carregando…</div>}>
          <TodoBoardView
            meetings={shownTodoMeetings}
            team={activeProject.team}
            externalContacts={activeProject.externalContacts || []}
            clientName={activeProject.company && activeProject.company.name}
            pid={activeProject.id}
            currentUser={currentUser}
            log={activeProject.log || []}
            pushUndoToast={pushAppUndoToast}
            focusMeetingId={todoFocusMeetingId}
            onClearFocusMeeting={() => setTodoFocusMeetingId(null)}
            focusActivityId={todoFocusActivityId}
            onClearFocusActivity={() => setTodoFocusActivityId(null)}
            activityOptions={buildActivityOptions(activeProject.activities, activeProject.phases)}
            onLinkActivity={canLinkTasks ? linkTaskToActivity : undefined}
            onSuggestLinks={canLinkTasks ? (mode) => requestTaskSuggestions(activeProject.id, mode) : undefined}
            onResetLinks={canLinkTasks ? (opts) => resetTaskLinks(activeProject.id, opts) : undefined}
            onOpenMeeting={(id) => { setView('meetings'); openMeetingDetail(activeProject.id, id); }}
            onAddItem={(meetingId, overrides) => addMeetingActionItem(activeProject.id, meetingId, overrides)}
            updateActionItem={updateMeetingActionItem}
            deleteActionItem={deleteMeetingActionItem}
            duplicateActionItem={duplicateActionItem}
            addSubtask={addTodoSubtask}
            toggleSubtask={toggleTodoSubtask}
            deleteSubtask={deleteTodoSubtask}
            addComment={addTodoComment}
            updateComment={updateTodoComment}
            deleteComment={deleteTodoComment}
            addAttachment={addTodoAttachment}
            deleteAttachment={deleteTodoAttachment}
          />
          </React.Suspense>
        )}
        {!isMulti && view === 'timeline' && (
          <TimelineView
            activities={shownActs}
            phases={activeProject.phases}
            granularity={granularity}
            setGranularity={setGranularity}
            windowAnchor={windowAnchor}
            setWindowAnchor={setWindowAnchor}
            pid={activeProject.id}
            updateActivity={updateActivity}
            openDetail={openActivityDetail}
            taskCounts={taskCountsByActivity(activeProject.meetings)}
            onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }}
          />
        )}
        {!isMulti && view === 'table' && (
          <TableView
            staff={currentUser.role === 'master' || currentUser.role === 'pricetax'}
            meetingsByPid={{ [activeProject.id]: activeProject.meetings || [] }}
            onOpenMeeting={openLinkedMeeting}
            activities={shownActs}
            orderMap={orderMap}
            phases={activeProject.phases}
            team={activeProject.team}
            pid={activeProject.id}
            expanded={expanded}
            setExpanded={setExpanded}
            updateActivity={updateActivity}
            deleteActivity={deleteActivity}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            reorderSub={reorderSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={openActivityDetail}
            companyColor={activeProject.company.color}
            taskCounts={taskCountsByActivity(activeProject.meetings)}
            onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }}
          />
        )}
        {!isMulti && view === 'phases' && (
          <PhasesView activities={shownActs} orderMap={orderMap} phases={activeProject.phases} pid={activeProject.id} updateActivity={updateActivity} openDetail={openActivityDetail} companyColor={activeProject.company.color} taskCounts={taskCountsByActivity(activeProject.meetings)} onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }} />
        )}
        {!isMulti && view === 'kanban' && (
          <KanbanView
            activities={shownActs}
            orderMap={orderMap}
            phases={activeProject.phases}
            pid={activeProject.id}
            dragId={dragId}
            setDragId={setDragId}
            updateActivity={updateActivity}
            addActivity={() => addActivity(activeProject.id)}
            openDetail={openActivityDetail}
            taskCounts={{ [activeProject.id]: taskCountsByActivity(activeProject.meetings) }}
            onOpenTasks={(activityId) => { setView('todo'); setTodoFocusActivityId(activityId); }}
          />
        )}

        {!isMulti && !isTpl && view === 'triagem' && (
          <CompanyTriage project={searching ? { ...activeProject, activities: shownActs } : activeProject} updateActivity={updateActivity} updateSub={updateSub} openDetail={openActivityDetail} onReserve={() => setShowCalendarBlock(true)} pushUndoToast={pushAppUndoToast} linkPautaTo={linkPautaTo} />
        )}

        {!isMulti && view === 'mapa' && (
          <MapView pid={activeProject.id} activities={shownActs} orderMap={orderMap} phases={activeProject.phases} companyName={activeProject.company.name} companyColor={activeProject.company.color} openDetail={openActivityDetail} />
        )}

        {isMulti && view === 'timeline' && selectedProjects.map((p) => (
          <div key={p.id} style={S.companySection}>
            <CompanySectionHeader project={p} onEditPhases={() => { setPhasesEditingProjectId(p.id); setShowPhases(true); }} />
            <TimelineView
              activities={shownPer[p.id]}
              phases={p.phases}
              granularity={granularity}
              setGranularity={setGranularity}
              windowAnchor={windowAnchor}
              setWindowAnchor={setWindowAnchor}
              pid={p.id}
              updateActivity={updateActivity}
              openDetail={openActivityDetail}
              taskCounts={multiTaskCounts[p.id]}
              onOpenTasks={(activityId) => openActivityTasks(p.id, activityId)}
            />
          </div>
        ))}
        {isMulti && view === 'table' && (
          <TableView
            staff={currentUser.role === 'master' || currentUser.role === 'pricetax'}
            meetingsByPid={Object.fromEntries(selectedProjects.map((p) => [p.id, p.meetings || []]))}
            onOpenMeeting={openLinkedMeeting}
            activities={shownMulti}
            expanded={expanded}
            setExpanded={setExpanded}
            updateActivity={updateActivity}
            deleteActivity={deleteActivity}
            addSub={addSub}
            updateSub={updateSub}
            deleteSub={deleteSub}
            reorderSub={reorderSub}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            openDetail={openActivityDetail}
            multiMode
            groupInfo={groupInfo}
            taskCounts={multiTaskCounts}
            onOpenTasks={(activityId, rowPid) => openActivityTasks(rowPid, activityId)}
          />
        )}
        {isMulti && view === 'phases' && selectedProjects.map((p) => (
          <div key={p.id} style={S.companySection}>
            <CompanySectionHeader project={p} onEditPhases={() => { setPhasesEditingProjectId(p.id); setShowPhases(true); }} />
            <PhasesView activities={shownPer[p.id]} orderMap={perCompanyOrderMap[p.id]} phases={p.phases} pid={p.id} updateActivity={updateActivity} openDetail={openActivityDetail} companyColor={p.company.color} taskCounts={multiTaskCounts[p.id]} onOpenTasks={(activityId) => openActivityTasks(p.id, activityId)} />
            <button style={{ ...S.iconBtn, marginTop: 8 }} onClick={() => addActivity(p.id)}><Plus size={14} /> Nova atividade em {p.company.name || 'empresa'}</button>
          </div>
        ))}
        {isMulti && view === 'kanban' && (
          <KanbanView
            activities={shownMulti}
            dragId={dragId}
            setDragId={setDragId}
            updateActivity={updateActivity}
            openDetail={openActivityDetail}
            multiMode
            groupInfo={groupInfo}
            taskCounts={multiTaskCounts}
            onOpenTasks={(activityId, rowPid) => openActivityTasks(rowPid, activityId)}
          />
        )}
        </React.Suspense>
        </SafeBoundary>
      </main>

      <React.Suspense fallback={null}>
        <PrintReport projects={isMulti ? selectedProjects : [activeProject]} generatedAt={fmtDate(todayISOStr())} options={pdfOptions} />
      </React.Suspense>
      {meetingToPrint && <MeetingPrintReport meeting={meetingToPrint.meeting} companyName={meetingToPrint.companyName} theme={meetingToPrint.theme} />}
      {pdfDialog && <PdfExportModal mode={pdfDialog.mode} prefs={pdfOptions} onConfirm={confirmPdfExport} onClose={() => setPdfDialog(null)} />}

      <div className="no-print" style={S.hint}>
        Alterações são salvas automaticamente e registradas no log. {isMulti ? `Você está vendo a visão geral de ${selectedProjects.length} empresas.` : `Você está vendo o projeto de ${activeProject.company.name || 'um cliente sem nome cadastrado'}.`}
      </div>

      <React.Suspense fallback={null}>
        {showVersions && activeProject && !isMulti && !isTpl && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
          <VersionHistoryModal projectId={activeProject.id} companyLabel={activeProject.company.name || 'Empresa'} onClose={() => setShowVersions(false)} flushSave={() => flushProjectSave(activeProject.id)} onRestored={() => reloadProjects()} />
        )}
        {showDeletedCompanies && currentUser.role === 'master' && <DeletedCompaniesModal onClose={() => setShowDeletedCompanies(false)} onRestored={() => reloadProjects()} />}
      </React.Suspense>

      {showLog && activeProject && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
        <SidePanel title="Log de alterações" onClose={() => setShowLog(false)}>
          {(activeProject.log || []).length === 0 && <div style={S.emptyMuted}>Nenhuma alteração registrada ainda.</div>}
          {(activeProject.log || []).map((l, i) => (
            <div key={i} style={S.logRow}>
              <div style={S.logTs}>{fmtTs(l.ts)}{l.user ? ` · ${l.user}` : ''}</div>
              <div style={S.logAction}>{l.action}</div>
            </div>
          ))}
        </SidePanel>
      )}

      {showTrash && activeProject && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (() => {
        const trashItems = [
          ...activeProject.activities.filter((a) => a.deleted).map((a) => ({ kind: 'activity', id: a.id, title: a.title, deletedAt: a.deletedAt, deletedBy: a.deletedBy })),
          ...activeProject.activities.flatMap((a) => a.deleted ? [] : (a.subactivities || []).filter((s) => s.deleted).map((s) => ({ kind: 'sub', id: s.id, activityId: a.id, title: s.title, parentTitle: a.title, deletedAt: s.deletedAt, deletedBy: s.deletedBy }))),
        ].sort((x, y) => (y.deletedAt || '').localeCompare(x.deletedAt || ''));
        return (
          <SidePanel title="Lixeira" onClose={() => setShowTrash(false)}>
            {trashItems.length === 0 && <div style={S.emptyMuted}>Nada excluído.</div>}
            {trashItems.map((item) => (
              <div key={`${item.kind}-${item.id}`} style={S.trashRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.trashTitle}>
                    {item.title}
                    {item.kind === 'sub' && <span style={S.trashParent}> — subatividade de "{item.parentTitle}"</span>}
                  </div>
                  <div style={S.logTs}>Excluída em {fmtTs(item.deletedAt)}{item.deletedBy ? ` · ${item.deletedBy}` : ''}</div>
                </div>
                <button
                  style={S.iconBtn}
                  onClick={() => item.kind === 'activity' ? restoreActivity(activeProject.id, item.id) : restoreSub(activeProject.id, item.activityId, item.id)}
                >
                  <Undo2 size={14} /> Restaurar
                </button>
              </div>
            ))}
          </SidePanel>
        );
      })()}


      {showSettings && activeProject && (
        <SidePanel title="Empresa e equipe" onClose={() => setShowSettings(false)}>
          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Logotipo do cliente</div>
            <div style={S.logoRow}>
              {activeProject.company.logo ? <img src={activeProject.company.logo} alt="logo" style={S.logoPreview} /> : <div style={S.logoPreviewEmpty}><Building2 size={22} color="var(--text-7)" /></div>}
              <button style={S.iconBtn} onClick={() => fileInputRef.current && fileInputRef.current.click()}><Upload size={14} /> Enviar logo</button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            </div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Cor master da empresa</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={activeProject.company.color || '#F5C400'} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, color: v } }), 'Cor da empresa atualizada'); }} style={S.colorInput} />
              <div style={S.fieldHint}>Usada pra identificar essa empresa quando várias estiverem selecionadas na visão geral.</div>
            </div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Nome da empresa</div>
            <input type="text" value={activeProject.company.name} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, name: v } })); }} onBlur={() => addLog(pid, `Nome da empresa atualizado: ${activeProject.company.name}`)} placeholder="Razão social" />
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Nome fantasia</div>
            <input type="text" value={activeProject.company.nomeFantasia || ''} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, nomeFantasia: v } })); }} onBlur={() => addLog(pid, `Nome fantasia atualizado: ${activeProject.company.nomeFantasia}`)} placeholder="Nome fantasia" />
            <div style={S.fieldHint}>Usado como identificação principal da empresa nas telas e listagens.</div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Tipo de cliente</div>
            <select
              value={activeProject.company.clientType || ''}
              onChange={(e) => {
                const v = e.target.value;
                mutateProject(pid, (p) => ({ ...p, company: { ...p.company, clientType: v } }), `Tipo de cliente alterado para: ${v ? CLIENT_TYPE_META[v].label : 'não definido'}`);
              }}
            >
              <option value="">Não definido</option>
              {CLIENT_TYPE_ORDER.map((t) => <option key={t} value={t}>{CLIENT_TYPE_META[t].label}</option>)}
            </select>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>CNPJ</div>
            <input type="text" value={activeProject.company.cnpj} onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, cnpj: v } })); }} onBlur={() => addLog(pid, `CNPJ atualizado: ${activeProject.company.cnpj}`)} placeholder="00.000.000/0000-00" />
            <div style={S.fieldHint}>Alterar o CNPJ não atualiza sozinho quem já tem acesso — ajuste em "Usuários" se precisar.</div>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Status da empresa</div>
            <select
              value={activeProject.company.status || 'ativo'}
              onChange={(e) => {
                const v = e.target.value;
                updateCompanyFields(pid, { status: v, resumeDate: v === 'ativo' ? '' : activeProject.company.resumeDate });
              }}
            >
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
            </select>
            {activeProject.company.status === 'pausado' && (
              <div style={{ marginTop: 8 }}>
                <div style={S.fieldHint}>Previsão de retomada (opcional)</div>
                <input
                  type="date"
                  value={activeProject.company.resumeDate || ''}
                  onChange={(e) => { const v = e.target.value; mutateProject(pid, (p) => ({ ...p, company: { ...p.company, resumeDate: v } })); }}
                  onBlur={() => addLog(pid, `Previsão de retomada atualizada: ${fmtDate(activeProject.company.resumeDate)}`)}
                />
              </div>
            )}
          </div>

          {(activeProject.company.nomeFantasia || activeProject.company.regimeTributario) && (
            <div style={S.settingsBlock}>
              <div style={S.settingsLabel}>Dados da Receita Federal</div>
              <div style={S.cnpjFetchGrid}>
                <div><div style={S.fieldHint}>Nome fantasia</div><strong>{activeProject.company.nomeFantasia || '—'}</strong></div>
                <div><div style={S.fieldHint}>Regime tributário</div><strong>{activeProject.company.regimeTributario || '—'}</strong></div>
                <div><div style={S.fieldHint}>Porte</div><strong>{activeProject.company.porte || '—'}</strong></div>
                <div><div style={S.fieldHint}>UF / Município</div><strong>{[activeProject.company.uf, activeProject.company.municipio].filter(Boolean).join(' — ') || '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><div style={S.fieldHint}>CNAE principal</div><strong>{activeProject.company.cnaePrincipal ? `${activeProject.company.cnaePrincipal} — ${activeProject.company.descricaoCnae}` : '—'}</strong></div>
              </div>

              {(activeProject.company.cnaesSecundarios || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={S.fieldHint}>CNAEs secundários</div>
                  {activeProject.company.cnaesSecundarios.map((c) => (
                    <div key={c.codigo} style={S.cnpjListRow}>{c.codigo} — {c.descricao}</div>
                  ))}
                </div>
              )}

              {(activeProject.company.qsa || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={S.fieldHint}>Quadro societário</div>
                  {activeProject.company.qsa.map((s, i) => (
                    <div key={i} style={S.cnpjListRow}>{s.nome} <span style={{ opacity: .6 }}>— {s.qualificacao}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Áreas e responsáveis do cliente</div>
            {(activeProject.company.areas || []).map((row) => (
              <AreaRow
                key={row.id} row={row}
                onUpdate={(patch) => updateAreaRow(row.id, patch)}
                onCommit={(overrides) => commitAreaRow(row.id, overrides)}
                onRemove={() => removeAreaRow(row.id)}
              />
            ))}
            <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addAreaRow}><Plus size={14} /> Nova área</button>
          </div>

          <div style={S.settingsBlock}>
            <div style={S.settingsLabel}>Equipe / responsáveis</div>
            <div style={S.fieldHint}>Cada responsável pode ser só um nome/área genérica, ou pode estar vinculado a um usuário real do sistema — aí dá pra ver o login dele, se é PRICETAX ou {activeProject.company.name || 'do cliente'}, e em qual área ele atua.</div>
            <div style={{ marginTop: 10 }}>
              {activeProject.team.map((m) => {
                const candidate = teamCandidates.find((c) => c.id === m.userId);
                const username = m.username || (candidate && candidate.username) || '';
                const empresa = m.role === 'cliente' ? (activeProject.company.name || 'Cliente') : 'PRICETAX';
                return (
                  <div key={m.id} style={S.teamCard}>
                    <div style={S.teamCardTop}>
                      <div style={S.teamCardName}>{m.name}</div>
                      <TeamLinkBadge link={m} companyName={activeProject.company.name} />
                      <button aria-label="Remover membro" title="Remover membro" style={S.chipX} onClick={() => removeMember(m.id)}><X aria-hidden="true" size={13} /></button>
                    </div>
                    {m.role && (
                      <div style={S.teamCardMeta}>{empresa}{username ? ` — usuário: ${username}` : ' — sem login próprio'}</div>
                    )}
                    <input
                      type="text"
                      value={m.area}
                      onChange={(e) => updateMemberArea(m.id, e.target.value)}
                      onBlur={() => commitMemberArea(m.id)}
                      placeholder="Área (ex: Financeiro)"
                      style={S.teamAreaInput}
                    />
                  </div>
                );
              })}
            </div>
            <div style={S.memberAddRow}>
              <input type="text" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Nome ou área genérica (sem login)" onKeyDown={(e) => e.key === 'Enter' && addMember()} />
              <button aria-label="Adicionar membro" title="Adicionar membro" style={S.iconBtn} onClick={addMember}><Plus aria-hidden="true" size={14} /></button>
            </div>
            <div style={{ ...S.fieldHint, marginTop: 10 }}>Ou vincule um usuário já cadastrado no sistema:</div>
            <div style={S.linkUserRow}>
              <select value={linkUserId} onChange={(e) => setLinkUserId(e.target.value)}>
                <option value="">Selecione o usuário...</option>
                {teamCandidates.filter((u) => !activeProject.team.some((m) => m.userId === u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.role === 'cliente' ? (activeProject.company.name || 'Cliente') : 'PRICETAX'}</option>
                ))}
              </select>
              <input type="text" value={linkArea} onChange={(e) => setLinkArea(e.target.value)} placeholder="Área em que ele atua (ex: Financeiro)" />
              <button title={!linkUserId ? 'Escolha um usuário para vincular' : undefined}
                style={{ ...S.iconBtn, justifyContent: 'center' }}
                disabled={!linkUserId}
                onClick={() => {
                  const u = teamCandidates.find((c) => c.id === linkUserId);
                  if (!u) return;
                  linkMember(u, linkArea.trim());
                  setLinkUserId('');
                  setLinkArea('');
                }}
              >
                <Plus size={14} /> Vincular
              </button>
            </div>
          </div>
        </SidePanel>
      )}

      {showPhases && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (() => {
        const target = projects.find((p) => p.id === phasesEditingProjectId);
        if (!target) return null;
        return (
          <SidePanel title={`Fases — ${target.company.name || 'projeto'}`} onClose={() => setShowPhases(false)}>
            <div style={S.emptyMuted}>As fases agrupam as atividades nas visões Gantt, Fases e no Quadro. Cada uma tem nome, cor e uma linha de descrição.</div>
            <div style={{ marginTop: 16 }}>
              {target.phases.map((p) => (
                <PhaseRow
                  key={p.id} p={p}
                  dragPhaseId={dragPhaseId} setDragPhaseId={setDragPhaseId}
                  reorderPhase={reorderPhase} updatePhase={updatePhase} deletePhase={deletePhase}
                  addLog={addLog} phasesEditingProjectId={phasesEditingProjectId}
                  canDelete={target.phases.length > 1}
                />
              ))}
            </div>
            <button style={{ ...S.iconBtn, marginTop: 4 }} onClick={addPhase}><Plus size={14} /> Nova fase</button>
          </SidePanel>
        );
      })()}

      {showCalendarBlock && activeProject && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
        <CompanyCalendarModal projectId={activeProject.id} companyLabel={activeProject.company.nomeFantasia || activeProject.company.name || 'Empresa'} onClose={() => setShowCalendarBlock(false)} />
      )}
      {showShareLink && activeProject && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && (
        <CompanyShareLinkModal projectId={activeProject.id} companyLabel={activeProject.company.nomeFantasia || activeProject.company.name || 'Empresa'} onClose={() => setShowShareLink(false)} />
      )}
      {showAudit && activeProject && !isMulti && (currentUser.role === 'master' || currentUser.role === 'pricetax') && guardModal(`audit:${activeProject.id}`, 'a auditoria do padrão', () => setShowAudit(false), (
        <StandardAuditModal projectId={activeProject.id} companyLabel={activeProject.company.nomeFantasia || activeProject.company.name || 'Empresa'} onClose={() => setShowAudit(false)}
          onOpenActivity={(id) => { setShowAudit(false); openActivityDetail(activeProject.id, id); }} />
      ))}
      {guardModal(openActivityId ? `activity-detail:${openActivityId.pid}:${openActivityId.id}` : 'activity-detail:', 'o detalhe da atividade', closeActivityDetail, renderActivityDetailModal())}
      {guardModal(openMeetingId ? `meeting-detail:${openMeetingId.pid}:${openMeetingId.id}` : 'meeting-detail:', 'o detalhe da reunião', closeMeetingDetail, renderMeetingDetailModal())}

      {showCreateCompany && (
        <CreateCompanyModal
          isSuperAdmin={currentUser.isSuperAdmin}
          organizations={organizations}
          projects={projects}
          onClose={() => setShowCreateCompany(false)}
          onCreate={async (company) => {
            await handleCreateCompanyPayload(company);
            setShowCreateCompany(false);
          }}
        />
      )}


      {showGroupActivityModal && (
        <GroupActivityCompaniesModal
          groupChildren={selectedProjects.filter((p) => p.id !== selectedGroupRoots[0]).map((p) => ({ id: p.id, name: p.company.nomeFantasia || p.company.name || 'Sem nome' }))}
          onClose={() => setShowGroupActivityModal(false)}
          onCreate={(involvedCompanyIds) => addGroupWideActivity(selectedGroupRoots[0], involvedCompanyIds)}
        />
      )}

      <ToastStack toasts={appToasts} onDismiss={dismissAppToast} />

      {!isMulti && !isTpl && (() => {
        const openMeeting = openMeetingId && openMeetingId.pid === activeProject.id
          ? (activeProject.meetings || []).find((m) => m.id === openMeetingId.id)
          : null;
        return (
          <ProjectAssistant
            projectId={activeProject.id}
            projectName={activeProject.company && (activeProject.company.nomeFantasia || activeProject.company.name)}
            view={view}
            openMeetingId={openMeeting ? openMeeting.id : null}
            openMeetingTitle={openMeeting ? openMeeting.title : null}
            openMeetingDate={openMeeting ? openMeeting.date : null}
            onOpenMeeting={(id) => { setView('meetings'); openMeetingDetail(activeProject.id, id); }}
            onReloadProjects={reloadProjects}
            onOpenAgenda={() => goToWorkspace('agenda')}
            canStudyPareceres={currentUser.isSuperAdmin || currentUser.role === 'master' || currentUser.role === 'pricetax'}
          />
        );
      })()}
      {/* A RENATA agora aparece em todas as abas de UMA empresa: no celular o botão fica menor e o conteúdo ganha folga embaixo para ele não cobrir o último botão/linha. */}
      {!isMulti && <style>{'@media (max-width: 768px) { .asst-fab { bottom: 12px !important; right: 12px !important; padding: 9px 13px !important; font-size: 12px !important; } }'}</style>}
    </div>
  );
}
