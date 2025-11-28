import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  z: number;
}

interface Edge {
  a: number;
  b: number;
  colorIdx: number;
}

class Graph3DSlow {
  private svg: SVGSVGElement;
  private width: number;
  private height: number;
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private maxNodes = 600;
  private nodeRadius = 4;
  private perspective = 0.001;
  private rotation = 0;
  private edgeColors: string[];
  private edgeMap = new Map<string, number>();
  private animationId: number | null = null;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.width = svg.clientWidth;
    this.height = svg.clientHeight;

    // Asteroid belt theme colors (using OKLCH values)
    this.edgeColors = [
      'rgba(180, 140, 90, 0.25)', // Bronze/metallic accent (oklch(65% 0.15 75))
      'rgba(150, 155, 165, 0.2)', // Cool steel gray (oklch(70% 0.02 240))
      'rgba(120, 115, 110, 0.2)', // Warm gray (oklch(50% 0.02 60))
    ];

    this.init();
    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  init() {
    for (let i = 0; i < 350; i++) this.addNode();
    this.updateEdges();
  }

  addNode() {
    const node: Node = {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      z: Math.random() * 2000 - 1000,
    };
    this.nodes.push(node);
    if (this.nodes.length > this.maxNodes) this.nodes.shift();
  }

  updateEdges() {
    const newEdges: Edge[] = [];
    const maxConnections = 2;
    const currentKeys = new Set<string>();

    for (let i = 0; i < this.nodes.length; i++) {
      const distances: Array<{ j: number; d: number }> = [];
      for (let j = 0; j < this.nodes.length; j++) {
        if (i === j) continue;
        const dx = this.nodes[i].x - this.nodes[j].x;
        const dy = this.nodes[i].y - this.nodes[j].y;
        const dz = this.nodes[i].z - this.nodes[j].z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        distances.push({ j, d });
      }
      distances.sort((a, b) => a.d - b.d);

      for (let k = 0; k < Math.min(maxConnections, distances.length); k++) {
        const aIdx = i;
        const bIdx = distances[k].j;
        const key = aIdx < bIdx ? `${aIdx}-${bIdx}` : `${bIdx}-${aIdx}`;
        currentKeys.add(key);

        let colorIdx: number;
        if (this.edgeMap.has(key)) {
          colorIdx = this.edgeMap.get(key)!;
        } else {
          colorIdx = Math.floor(Math.random() * this.edgeColors.length);
          this.edgeMap.set(key, colorIdx);
        }
        newEdges.push({ a: aIdx, b: bIdx, colorIdx });
      }
    }

    // Remove edges that no longer exist
    const keysToDelete: string[] = [];
    this.edgeMap.forEach((_, key) => {
      if (!currentKeys.has(key)) keysToDelete.push(key);
    });
    keysToDelete.forEach((key) => this.edgeMap.delete(key));

    this.edges = newEdges;
  }

  project(point: Node) {
    const scale = 1 / (1 + point.z * this.perspective);
    return {
      x: point.x * scale + (this.width / 2) * (1 - scale),
      y: point.y * scale + (this.height / 2) * (1 - scale),
      scale,
    };
  }

  rotateY(point: Node) {
    const sinA = Math.sin(this.rotation);
    const cosA = Math.cos(this.rotation);
    const x = point.x - this.width / 2;
    const z = point.z;
    const rotatedX = cosA * x + sinA * z;
    const rotatedZ = -sinA * x + cosA * z;
    return { x: rotatedX + this.width / 2, y: point.y, z: rotatedZ };
  }

  clear() {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
  }

  draw() {
    this.clear();

    // Draw edges first
    for (const e of this.edges) {
      const a = this.rotateY(this.nodes[e.a]);
      const b = this.rotateY(this.nodes[e.b]);
      const p1 = this.project(a);
      const p2 = this.project(b);
      const line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line'
      );
      line.setAttribute('x1', p1.x.toString());
      line.setAttribute('y1', p1.y.toString());
      line.setAttribute('x2', p2.x.toString());
      line.setAttribute('y2', p2.y.toString());
      line.setAttribute('stroke', this.edgeColors[e.colorIdx]);
      line.setAttribute('stroke-width', '1');
      this.svg.appendChild(line);
    }

    // Draw nodes with bronze/metallic accent color
    for (const n of this.nodes) {
      const rp = this.rotateY(n);
      const p = this.project(rp);
      const circle = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle'
      );
      circle.setAttribute('cx', p.x.toString());
      circle.setAttribute('cy', p.y.toString());
      const r = this.nodeRadius * p.scale;
      circle.setAttribute('r', Math.max(r, 0.5).toString());
      // Bronze accent with glow
      circle.setAttribute('fill', 'rgba(180, 140, 90, 0.7)');
      this.svg.appendChild(circle);
    }
  }

  animate() {
    // Slower rotation
    this.rotation += 0.0002;

    // Drift nodes with slower speed
    const speed = Math.random() * 0.2;
    for (const n of this.nodes) {
      n.x += (Math.random() - 0.5) * speed;
      n.y += (Math.random() - 0.5) * speed;
      n.z += (Math.random() - 0.5) * speed * 2;

      // Wrap around
      if (n.x < 0) n.x += this.width;
      if (n.x > this.width) n.x -= this.width;
      if (n.y < 0) n.y += this.height;
      if (n.y > this.height) n.y -= this.height;
      if (n.z < -1000) n.z = 1000;
      if (n.z > 1000) n.z = -1000;
    }

    // Slower random creation/destruction
    const changeRate = Math.random() * 0.01;

    if (Math.random() < changeRate) this.addNode();
    if (Math.random() < changeRate) this.addNode();

    if (Math.random() < changeRate && this.nodes.length > 10) {
      this.nodes.splice(Math.floor(Math.random() * this.nodes.length), 1);
    }

    this.updateEdges();
    this.draw();
    this.animationId = requestAnimationFrame(this.animate);
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }
}

export const Graph3DBackground = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const graphRef = useRef<Graph3DSlow | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    graphRef.current = new Graph3DSlow(svgRef.current);

    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 -z-1 overflow-hidden opacity-30">
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
};
