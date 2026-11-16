export interface ExampleProject {
  readonly id: string;
  readonly name: string;
  readonly filename: string;
  readonly description: string;
  readonly source: string;
  readonly tags: readonly string[];
}

export const EXAMPLE_PROJECTS: readonly ExampleProject[] = [
  { id: 'scissor-lift', name: 'Spring-assisted scissor lift', filename: 'spring-scissor-lift.slinker',
    description: 'Two scissor stages raise a platform on a moving rail, with spring assistance and a dashpot.',
    source: 'New in 17.0.0', tags: ['Moving rail', 'Springs', 'Load sensor'] },
  { id: 'winged-airer', name: 'Flap - Winged Airer', filename: 'airer.slinker',
    description: 'The original folding airer with coupled wings, legs and sliders.',
    source: 'User supplied', tags: ['Folding mechanism', 'Legacy project'] },
  { id: 'working-screen', name: 'Working Screen', filename: 'working-screen.json',
    description: 'The original screen, drawer and door linkage assembly.',
    source: 'User supplied', tags: ['Coupled linkages', 'Legacy project'] },
  { id: 'playground', name: 'Mechanism Playground', filename: 'mechanism-playground.slinker',
    description: 'Crank-slider, damped carriage and torsion gripper in one project.',
    source: 'Earlier showcase', tags: ['Three mechanisms', 'Traces', 'Load sensors'] },
  { id: 'crank-slider', name: 'Spring-driven crank-slider', filename: 'crank-slider.slinker',
    description: 'A rocking crank drives a sliding output; tracers reveal the crank and coupler paths.',
    source: 'Playground detail', tags: ['Slider', 'Spring', 'Coupler curve'] },
  { id: 'carriage', name: 'Damped carriage and end stop', filename: 'damped-carriage.slinker',
    description: 'A spring-return carriage runs on parallel rails and meets a finite barrier.',
    source: 'Playground detail', tags: ['Damper', 'Contact', 'Parallel rails'] },
  { id: 'gripper', name: 'Torsion-spring gripper', filename: 'torsion-gripper.slinker',
    description: 'Two jaws share a fixed hinge and settle toward the torsion spring rest angle.',
    source: 'Playground detail', tags: ['Torsion', 'Traces', 'Load sensor'] },
];

export function exampleAssetPath(example: ExampleProject, base: string): string {
  if (!EXAMPLE_PROJECTS.some(e => e.id === example.id && e.filename === example.filename)
    || !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid example asset.');
  return base + 'examples/' + encodeURIComponent(example.filename);
}
