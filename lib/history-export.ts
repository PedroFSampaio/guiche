import { zipSync, strToU8 } from 'fflate';
import { SERVICES, dayKey, type State, type Member } from './queue.ts';
import { visibleQueue } from './visible-queue.ts';
const statuses: Record<string, string> = { waiting: 'Aguardando', calling: 'Chamado', serving: 'Em atendimento', done: 'Atendido', absent: 'Ausente', left: 'Foi embora', cancelled: 'Cancelado', automatic: 'Encerrado automaticamente' };
const clock = (value?: number) => value ? new Date(value).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
export function historyRows(state: State, me: Member, day = dayKey()) {
    if (me.role !== 'admin' && !Object.hasOwn(SERVICES, me.role))
        throw Error('Este perfil não pode exportar o histórico.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
        throw Error('Data inválida.');
    const visible = visibleQueue(state, me, day);
    return (visible.patients as State['patients']).filter(p => p.day === day).sort((a, b) => a.created - b.created).map(p => {
        const member = state.members.find(m => m.email === p.owner);
        const event = [...p.events].reverse().find(e => e.text.startsWith('Chamado por '));
        const caller = p.calledByName || member?.name || event?.text.slice('Chamado por '.length) || '';
        const username = p.calledByUsername || member?.username || '';
        return [day.split('-').reverse().join('/'), p.code, p.name, SERVICES[p.service], clock(p.created), clock(p.called), clock(p.started), caller, username, p.status === 'done' ? 'Sim' : 'Não', statuses[p.status] || p.status];
    });
}
const escape = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function historyWorkbook(state: State, me: Member, day: string) {
    const rows = [['Data', 'Senha', 'Nome do paciente', 'Atividade', 'Chegada', 'Chamada', 'Início do atendimento', 'Nome de quem chamou', 'Usuário que chamou', 'Foi atendido?', 'Situação'], ...historyRows(state, me, day)];
    const sheetRows = rows.map((row, r) => '<row r="' + (r + 1) + '" ht="' + (r === 0 ? 32 : 28) + '" customHeight="1">' + row.map((value, c) => '<c r="' + String.fromCharCode(65 + c) + (r + 1) + '" t="inlineStr" s="' + (r === 0 ? 1 : 2) + '"><is><t xml:space="preserve">' + escape(value) + '</t></is></c>').join('') + '</row>').join('');
    const widths = [14, 13, 38, 30, 13, 13, 23, 30, 24, 17, 30];
    const files: Record<string, string> = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Atendimentos" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/styles.xml': '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF137B6C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
        'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:K' + rows.length + '"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols><sheetData>' + sheetRows + '</sheetData><autoFilter ref="A1:K' + rows.length + '"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>'
    };
    return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml)])));
}
