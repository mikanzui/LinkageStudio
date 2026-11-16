import { buildCadScene, legacyCadGraph, singleLineComment, validateCadScene } from '../core/cad-scene';
import type { CadScene, LegacyCadArguments } from '../core/cad-scene';
import { assertExportUnit, cadNumber, scaleCadNumber, validateCadScale } from './export-manager';
import type { ExportUnit } from './export-manager';

/** Late-bound Visual Basic text (.swb), not VBScript or a binary VBA project (.swp). */
export function writeSolidWorksMacro(scene: CadScene, unit: ExportUnit): string {
  assertExportUnit(unit);
  validateCadScene(scene);
  validateCadScale(scene, 0.0004);
  const f = (value: number) => cadNumber(scaleCadNumber(value, 0.0004)) + '#';
  const point = (p: { x: number; y: number }) => `${f(p.x)}, ${f(-p.y)}, 0#`;
  const displayUnit = { mm: 'swMM', cm: 'swCM', m: 'swMETER', in: 'swINCHES' }[unit];
  const out = [
    "' Linkage Studio - late-bound Visual Basic text macro (.swb).",
    "' Coordinates are meters; the requested display unit does not rescale geometry.",
    "' Creates a new part on its first reference plane (normally Front in standard templates).",
    "' Layer identity is retained in comments; part-sketch layer/color fidelity is not promised.",
    'Option Explicit',
    'Const swDocPART = 1',
    'Const swMM = 0', 'Const swCM = 1', 'Const swMETER = 2', 'Const swINCHES = 3',
    'Const swDECIMAL = 1',
    'Sub main()',
    '    Dim swApp As Object', '    Dim Part As Object', '    Dim SketchMgr As Object',
    '    Dim feat As Object', '    Dim segment As Object', '    Dim activeSketch As Object',
    '    Dim templatePath As String', '    Dim selected As Boolean', '    Dim sketchOpen As Boolean',
    '    Dim previousAddToDB As Boolean', '    Dim databaseChanged As Boolean', '    Dim failure As String',
    '    On Error GoTo Failed',
    '    Set swApp = Application.SldWorks',
    '    If swApp Is Nothing Then',
    '        MsgBox "Run this macro inside SOLIDWORKS."', '        Exit Sub', '    End If',
    '    templatePath = swApp.GetDocumentTemplate(swDocPART, "", 0, 0#, 0#)',
    '    If Len(templatePath) = 0 Then',
    '        MsgBox "No part template selected. Configure a default Part template in SOLIDWORKS Options > Default Templates and retry."',
    '        Exit Sub', '    End If',
    '    Set Part = swApp.NewDocument(templatePath, 0, 0#, 0#)',
    '    If Part Is Nothing Then',
    '        MsgBox "Could not create a Part. Check the selected part template path and permissions, then retry."',
    '        Exit Sub', '    End If',
    '    If Part.GetType <> swDocPART Then',
    '        MsgBox "The selected template did not create a Part. Choose a Part template and retry."',
    '        Exit Sub', '    End If',
    `    Part.SetUnits ${displayUnit}, swDECIMAL, 0, 8, False`,
    '    Part.ClearSelection2 True', '    Set feat = Part.FirstFeature',
    '    Do While Not feat Is Nothing',
    '        If feat.GetTypeName2 = "RefPlane" Then',
    '            selected = feat.Select2(False, 0)', '            Exit Do', '        End If',
    '        Set feat = feat.GetNextFeature', '    Loop',
    '    If Not selected Then',
    '        MsgBox "Could not select the first reference plane. Use a Part template with a reference plane and retry."',
    '        Exit Sub', '    End If',
    '    Set SketchMgr = Part.SketchManager', '    SketchMgr.InsertSketch True',
    '    Set activeSketch = SketchMgr.ActiveSketch',
    '    If activeSketch Is Nothing Then',
    '        MsgBox "Could not open a sketch on the selected reference plane. No geometry imported."',
    '        Exit Sub', '    End If', '    sketchOpen = True',
    '    previousAddToDB = SketchMgr.AddToDB', '    SketchMgr.AddToDB = True', '    databaseChanged = True',
  ];
  for (const layer of scene.layers) out.push(`    ' Layer ${singleLineComment(`${layer.name}; source body ${layer.sourceBodyId ?? '(guide/default)'}; color ${layer.color}`)}`);
  for (const warning of scene.warnings) out.push(`    ' Warning ${singleLineComment(warning.message)}`);
  const create = (call: string, construction: boolean) => {
    if (call.length > 800) {
      // Extreme finite decimal literals can exceed Visual Basic's physical-line limit.
      const open = call.indexOf('(');
      const args = call.slice(open + 1, -1).split(', ');
      out.push(`    Set segment = SketchMgr.${call.slice(0, open)}( _`);
      args.forEach((arg, i) => out.push(`        ${arg}${i === args.length - 1 ? ')' : ', _'}`));
    } else out.push(`    Set segment = SketchMgr.${call}`);
    out.push('    If segment Is Nothing Then',
      '        failure = "SOLIDWORKS rejected a geometry call. The new Part may be incomplete; discard it and check geometry size/tolerance before retrying."',
      '        GoTo Failed', '    End If', `    segment.ConstructionGeometry = ${construction ? 'True' : 'False'}`);
  };
  for (const entity of scene.entities) {
    out.push(`    ' ${singleLineComment(`${entity.kind} ${entity.sourceId}; layer ${entity.layer}; ${entity.label}`)}`);
    if (entity.type === 'circle') create(`CreateCircleByRadius(${point(entity.center)}, ${f(entity.radius)})`, false);
    else if (entity.type === 'line') create(`CreateLine(${point(entity.start)}, ${point(entity.end)})`, entity.construction);
    else {
      const edges = entity.closed ? entity.points.length : entity.points.length - 1;
      for (let i = 0; i < edges; i++) create(`CreateLine(${point(entity.points[i])}, ${point(entity.points[(i + 1) % entity.points.length])})`, false);
    }
  }
  out.push('    SketchMgr.AddToDB = previousAddToDB', '    databaseChanged = False',
    '    SketchMgr.InsertSketch True', '    sketchOpen = False', '    Part.ClearSelection2 True', '    Part.ViewZoomtofit2',
    '    MsgBox "CAD sketch created in a new unsaved Part. Review the imported geometry and omission comments before saving."',
    '    Exit Sub', 'Failed:',
    '    If Len(failure) = 0 Then failure = "CAD import failed: " & Err.Description & ". The new Part may be incomplete; discard it before retrying."',
    '    On Error Resume Next', '    If databaseChanged Then SketchMgr.AddToDB = previousAddToDB',
    '    If sketchOpen Then SketchMgr.InsertSketch True', '    MsgBox failure', 'End Sub');
  return out.join('\r\n') + '\r\n';
}

export function exportSolidWorksMacro(...[joints, links, bodies, baseBodyId, outlines, sliders, colliders, showLinksGlobal = true, unit = 'mm']:
  [...LegacyCadArguments, showLinksGlobal?: boolean, unit?: ExportUnit]): string {
  return writeSolidWorksMacro(buildCadScene(legacyCadGraph(joints, links, bodies, baseBodyId, outlines, sliders, colliders), showLinksGlobal), unit);
}
