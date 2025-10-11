import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Link,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/700.css';
import './App.css';

const PCA_SCENE_SCALE = {
  cloud: 2, // adjust to make the PCA point cloud larger or smaller
  axis: 10.6, // scales the principal component arrows
  planePrimary: 4.4, // scales the primary direction of the plane
  planeSecondary: 4.05, // scales the secondary direction of the plane
};

const LORENZ_DEFAULTS = {
  sigma: 10,
  rho: 28,
  beta: 8 / 3,
  dt: 0.01,
  steps: 30000,
  discard: 1000,
  initial: [0.1, 0, 0],
  scale: 0.5,
};

const REGRESSION_CONFIG = {
  sampleCount: 180,
  xRange: [-6, 6],
  zRange: [-6, 6],
  noiseSigma: 0.8,
  plane: { a: 1.2, b: -0.95, c: 3.4 },
  gridResolution: 36,
};

const BELL_CURVE_CONFIG = {
  ballCount: 140,
  pegRows: 12,
  horizontalStep: 0.48,
  spawnHeight: 9.5,
  groundY: -10.2,
  gravity: -18,
  binCount: 28,
  binWidth: 0.65,
  jitterZ: 0,
  gaussianSigma: 3.4,
  gaussianMean: 0,
  gaussianAmplitude: 12,
};

function mulberry32(seed) {
  return function prng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seededRandom = mulberry32(0x1f2e3d4c);

function SpinningLogo() {
  const groupRef = useRef();

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.5, 0.5, 0.5]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
      <mesh position={[-0.5, -0.5, -0.5]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#999999" />
      </mesh>
    </group>
  );
}

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function createPCAData(pointCount, varianceMultiplier) {
  const eigenvectors = [
    new THREE.Vector3(0.82, 0.36, 0.45).normalize(),
    new THREE.Vector3(-0.28, 0.93, -0.24).normalize(),
    new THREE.Vector3(-0.52, -0.08, 0.85).normalize(),
  ];
  const sigmas = [2.6 * varianceMultiplier, 1.45 * varianceMultiplier, 0.72 * varianceMultiplier];
  const basePositions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const modulations = new Float32Array(pointCount);
  const temp = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < pointCount; i += 1) {
    const coefficients = sigmas.map((sigma) => gaussianRandom() * sigma);
    temp.set(0, 0, 0);

    eigenvectors.forEach((vector, idx) => {
      temp.addScaledVector(vector, coefficients[idx] * PCA_SCENE_SCALE.cloud);
    });

    // add slight lift so the cloud doesn't sit perfectly flat
    temp.y += gaussianRandom() * 0.35;

    basePositions[i * 3] = temp.x;
    basePositions[i * 3 + 1] = temp.y;
    basePositions[i * 3 + 2] = temp.z;

    const normalized = THREE.MathUtils.clamp((coefficients[0] / (sigmas[0] * 3) + 1) / 2, 0, 1);
    color.setHSL(THREE.MathUtils.lerp(0.55, 0.78, normalized), 0.72, 0.6);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    modulations[i] = coefficients[2] / (sigmas[2] || 1);
  }

  return {
    basePositions,
    colors,
    eigenvectors,
    sigmas,
    modulations,
  };
}

function PCAScatter({ data, mode }) {
  const pointsRef = useRef();
  const groupRef = useRef();
  const animatedPositions = useMemo(() => data.basePositions.slice(), [data.basePositions]);
  const pointCount = animatedPositions.length / 3;
  const dataRef = useRef(data);
  const modeRef = useRef(mode);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!pointsRef.current) return;
    const { position } = pointsRef.current.geometry.attributes;
    if (position) {
      position.usage = THREE.DynamicDrawUsage;
    }
    pointsRef.current.geometry.computeBoundingSphere();
  }, [animatedPositions]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const currentMode = modeRef.current;
    const currentData = dataRef.current;
    const rotationSpeed = currentMode === 'network' ? 0.14 : currentMode === 'soft' ? 0.05 : 0.09;
    if (groupRef.current) {
      groupRef.current.rotation.y = t * rotationSpeed;
    }
    if (!pointsRef.current) return;

    const wobbleStrength = currentMode === 'network' ? 0.24 : currentMode === 'soft' ? 0.16 : 0.2;
    const secondaryStrength = currentMode === 'network' ? 0.16 : 0.12;

    for (let i = 0; i < pointCount; i += 1) {
      const idx = i * 3;
      const baseX = currentData.basePositions[idx];
      const baseY = currentData.basePositions[idx + 1];
      const baseZ = currentData.basePositions[idx + 2];
      const wobble = Math.sin(t * 0.6 + i * 0.035 + currentData.modulations[i]) * wobbleStrength;
      const secondary = Math.cos(t * 0.45 + i * 0.021) * secondaryStrength;

      const offsetX =
        currentData.eigenvectors[1].x * wobble + currentData.eigenvectors[2].x * secondary;
      const offsetY =
        currentData.eigenvectors[1].y * wobble + currentData.eigenvectors[2].y * secondary;
      const offsetZ =
        currentData.eigenvectors[1].z * wobble + currentData.eigenvectors[2].z * secondary;

      animatedPositions[idx] = baseX + offsetX;
      animatedPositions[idx + 1] = baseY + offsetY;
      animatedPositions[idx + 2] = baseZ + offsetZ;
    }

    const positionAttr = pointsRef.current.geometry.attributes.position;
    positionAttr.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[animatedPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.22}
          vertexColors
          transparent
          opacity={0.94}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
}

function AxisArrow({ direction, length, color, opacity = 1 }) {
  const arrowRef = useRef();

  useEffect(() => {
    if (!arrowRef.current) return;
    const axis = new THREE.Vector3(0, 1, 0);
    const dir = direction.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, dir);
    arrowRef.current.quaternion.copy(quaternion);
  }, [direction]);

  const headLength = length * 0.2;
  const shaftLength = length - headLength;

  return (
    <group ref={arrowRef}>
      <mesh position={[0, shaftLength / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, shaftLength, 20]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          roughness={0.32}
          metalness={0.18}
        />
      </mesh>
      <mesh position={[0, shaftLength + headLength / 2, 0]}>
        <coneGeometry args={[0.14, headLength, 20]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          roughness={0.22}
          metalness={0.35}
        />
      </mesh>
    </group>
  );
}

function AxisLabel({ direction, length, text, color }) {
  const position = direction.clone().normalize().multiplyScalar(length + 0.5);

  return (
    <Html position={position} center>
      <div
        style={{
          padding: '4px 10px',
          borderRadius: '999px',
          border: '1px solid rgba(148,163,184,0.35)',
          background: 'rgba(15,23,42,0.78)',
          color,
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

const AXIS_COLORS = ['#38bdf8', '#a855f7', '#f97316'];

function AxisPair({ vector, length, color, label }) {
  const pairRef = useRef();

  useFrame(({ clock }) => {
    if (!pairRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + 0.04 * Math.sin(t * 1.1 + length);
    pairRef.current.scale.setScalar(pulse);
  });

  return (
    <group>
      <group ref={pairRef}>
        <AxisArrow direction={vector} length={length} color={color} />
        <AxisArrow
          direction={vector.clone().multiplyScalar(-1)}
          length={length * 0.85}
          color={color}
          opacity={0.4}
        />
      </group>
      <AxisLabel direction={vector} length={length} text={label} color={color} />
    </group>
  );
}

function PrincipalAxes({ eigenvectors, sigmas }) {
  return (
    <group>
      {eigenvectors.map((vector, idx) => {
        const color = AXIS_COLORS[idx % AXIS_COLORS.length];
        const length = sigmas[idx] * PCA_SCENE_SCALE.axis;
        return (
          <AxisPair
            key={`axis-${idx}`}
            vector={vector}
            length={length}
            color={color}
            label={`PC${idx + 1}`}
          />
        );
      })}
    </group>
  );
}

function PrincipalPlane({ eigenvectors, sigmas, mode }) {
  const planeRef = useRef();
  const [primary, secondary] = eigenvectors;

  useEffect(() => {
    if (!planeRef.current) return;
    const normal = new THREE.Vector3().crossVectors(primary, secondary).normalize();
    const basis = new THREE.Matrix4().makeBasis(
      primary.clone().normalize(),
      secondary.clone().normalize(),
      normal
    );
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
    planeRef.current.setRotationFromQuaternion(quaternion);
    planeRef.current.scale.set(
      sigmas[0] * PCA_SCENE_SCALE.planePrimary,
      sigmas[1] * PCA_SCENE_SCALE.planeSecondary,
      1
    );
  }, [primary, secondary, sigmas]);

  useFrame(({ clock }) => {
    if (!planeRef.current) return;
    const t = clock.getElapsedTime();
    const baseOpacity = mode === 'soft' ? 0.26 : 0.34;
    const variation = mode === 'network' ? 0.06 : 0.04;
    planeRef.current.material.opacity = baseOpacity + variation * Math.sin(t * 0.6);
  });

  return (
    <mesh ref={planeRef} position={[0, -0.15, 0]}>
      <planeGeometry args={[1, 1, 16, 16]} />
      <meshStandardMaterial
        color="#0f172a"
        transparent
        opacity={0.32}
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function PCAStudio({ mode = 'default' }) {
  const pointCount = mode === 'network' ? 860 : mode === 'soft' ? 520 : 700;
  const varianceMultiplier = mode === 'network' ? 1.18 : mode === 'soft' ? 0.9 : 1;
  const data = useMemo(
    () => createPCAData(pointCount, varianceMultiplier),
    [pointCount, varianceMultiplier]
  );

  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -0.4, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.45}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.35, 0.54, 0.78]}
        fadeDistance={60}
        fadeStrength={0.2}
      />
      <PCAScatter data={data} mode={mode} />
      <PrincipalAxes eigenvectors={data.eigenvectors} sigmas={data.sigmas} />
      <PrincipalPlane eigenvectors={data.eigenvectors} sigmas={data.sigmas} mode={mode} />
    </group>
  );
}

function GaussianPoints({ size = 45, spacing = 0.7, sigma = 9, amplitude = 8 }) {
  const pointsRef = useRef();

  const data = useMemo(() => {
    const grid = size;
    const total = grid * grid;
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const baseHeights = new Float32Array(total);
    const half = (grid - 1) / 2;
    const color = new THREE.Color();

    let index = 0;
    for (let ix = 0; ix < grid; ix += 1) {
      for (let iz = 0; iz < grid; iz += 1) {
        const x = (ix - half) * spacing;
        const z = (iz - half) * spacing;
        const distanceSq = x * x + z * z;
        const height = Math.exp(-distanceSq / (2 * sigma * sigma)) * amplitude;

        positions[index * 3] = x;
        positions[index * 3 + 1] = height;
        positions[index * 3 + 2] = z;
        baseHeights[index] = height;

        const hue = THREE.MathUtils.clamp(0.55 - height / (amplitude * 2.5), 0, 1);
        color.setHSL(hue, 0.75, 0.45 + (height / amplitude) * 0.35);

        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        index += 1;
      }
    }

    return { positions, colors, baseHeights, count: total };
  }, [size, spacing, sigma, amplitude]);

  const baseRef = useRef(data.baseHeights);

  useEffect(() => {
    baseRef.current = data.baseHeights;
  }, [data.baseHeights]);

  useEffect(() => {
    if (!pointsRef.current) return;
    const { position } = pointsRef.current.geometry.attributes;
    if (position) {
      position.usage = THREE.DynamicDrawUsage;
    }
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const positionAttr = pointsRef.current.geometry.attributes.position;
    const time = clock.getElapsedTime();

    for (let i = 0; i < data.count; i += 1) {
      const base = baseRef.current[i];
      const oscillation = 1 + 0.1 * Math.sin(time * 0.6 + i * 0.08);
      positionAttr.setY(i, base * oscillation);
    }

    positionAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.25}
        vertexColors
        transparent
        opacity={0.95}
        sizeAttenuation
      />
    </points>
  );
}

function NormalCurve({ mean = 0, stdDev = 4.5, amplitude = 8, segments = 160 }) {
  const curveRef = useRef();

  const data = useMemo(() => {
    const positions = new Float32Array(segments * 3);
    const baseHeights = new Float32Array(segments);

    for (let i = 0; i < segments; i += 1) {
      const t = i / (segments - 1);
      const x = THREE.MathUtils.lerp(-15, 15, t);
      const height = Math.exp(-((x - mean) ** 2) / (2 * stdDev * stdDev)) * amplitude * 1.05;

      positions[i * 3] = x;
      positions[i * 3 + 1] = height + 0.2;
      positions[i * 3 + 2] = 0;
      baseHeights[i] = height + 0.2;
    }

    return { positions, baseHeights };
  }, [segments, mean, stdDev, amplitude]);

  const baseRef = useRef(data.baseHeights);

  useEffect(() => {
    baseRef.current = data.baseHeights;
  }, [data.baseHeights]);

  useEffect(() => {
    if (!curveRef.current) return;
    const { position } = curveRef.current.geometry.attributes;
    if (position) {
      position.usage = THREE.DynamicDrawUsage;
    }
  }, []);

  useFrame(({ clock }) => {
    if (!curveRef.current) return;
    const positionAttr = curveRef.current.geometry.attributes.position;
    const time = clock.getElapsedTime();

    for (let i = 0; i < data.baseHeights.length; i += 1) {
      const base = baseRef.current[i];
      const offset = Math.sin(time * 0.8 + i * 0.1) * 0.15;
      positionAttr.setY(i, base + offset);
    }

    positionAttr.needsUpdate = true;
  });

  return (
    <line ref={curveRef} position={[0, 0, 0.1]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#7dd3fc" />
    </line>
  );
}

function AxisGuides() {
  const positions = useMemo(
    () =>
      new Float32Array([
        -15, 0, 0,
        15, 0, 0,
        0, 0, -15,
        0, 0, 15,
      ]),
    []
  );

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.25} />
    </lineSegments>
  );
}

function GaussianStudio({ showCurve = true }) {
  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.5, 0.5, 0.5]}
        fadeDistance={50}
      />
      <GaussianPoints />
      {showCurve ? <NormalCurve /> : null}
      <AxisGuides />
    </group>
  );
}

const NETWORK_SCENE_SETTINGS = {
  default: {
    nodeCount: 360,
    radius: 20.4,
    linkPerNode: 3,
    pulseStrength: 0.2,
    spin: 0.1,
  },
  soft: {
    nodeCount: 280,
    radius: 4.6,
    linkPerNode: 5,
    pulseStrength: 2,
    spin: 0.12,
  },
  network: {
    nodeCount: 420,
    radius: 600.2,
    linkPerNode: 4,
    pulseStrength: 0.1,
    spin: 0.24,
  },
};

const NETWORK_CLUSTER_HUES = [0.53, 0.72, 0.88, 0.1];

function createNetworkData({ nodeCount, radius, linkPerNode }) {
  const basePositions = new Float32Array(nodeCount * 3);
  const colors = new Float32Array(nodeCount * 3);
  const modulations = new Float32Array(nodeCount);
  const vector = new THREE.Vector3();
  const color = new THREE.Color();
  const clusterCount = NETWORK_CLUSTER_HUES.length;
  const clusterSize = Math.ceil(nodeCount / clusterCount);

  for (let i = 0; i < nodeCount; i += 1) {
    const cluster = Math.min(clusterCount - 1, Math.floor(i / clusterSize));
    const swirl = (i / nodeCount) * Math.PI * 2;
    const radial = radius * (0.65 + Math.random() * 0.35);
    const verticalOffset = Math.sin(swirl * 0.45) * 1.4;

    vector.set(
      Math.cos(swirl) * radial + gaussianRandom() * 0.9,
      verticalOffset + gaussianRandom() * 0.7,
      Math.sin(swirl) * radial + gaussianRandom() * 0.9
    );

    basePositions[i * 3] = vector.x;
    basePositions[i * 3 + 1] = vector.y;
    basePositions[i * 3 + 2] = vector.z;

    const hue = NETWORK_CLUSTER_HUES[cluster];
    const lightness = 0.58 + Math.random() * 0.18;
    color.setHSL(hue, 0.72, lightness);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    modulations[i] = Math.random() * Math.PI * 2;
  }

  const edgeSet = new Set();
  const tentativeStep = Math.max(3, Math.floor(nodeCount / (clusterCount * 3)));

  for (let i = 0; i < nodeCount; i += 1) {
    for (let link = 1; link <= linkPerNode; link += 1) {
      const sameClusterOffset = link * tentativeStep + Math.floor(Math.random() * tentativeStep);
      const neighborWithinCluster = (i + sameClusterOffset) % nodeCount;
      const crossClusterOffset =
        Math.floor(nodeCount / clusterCount) * link +
        Math.floor(Math.random() * clusterSize);
      const neighborCrossCluster = (i + crossClusterOffset) % nodeCount;

      const candidates = [neighborWithinCluster, neighborCrossCluster];

      candidates.forEach((candidate) => {
        if (candidate === i) return;
        const key = i < candidate ? `${i}-${candidate}` : `${candidate}-${i}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
        }
      });
    }
  }

  const edgePairs = new Uint16Array(edgeSet.size * 2);
  let edgeIndex = 0;
  edgeSet.forEach((value) => {
    const [a, b] = value.split('-').map((item) => Number.parseInt(item, 10));
    edgePairs[edgeIndex] = a;
    edgePairs[edgeIndex + 1] = b;
    edgeIndex += 2;
  });

  return {
    basePositions,
    colors,
    modulations,
    edges: edgePairs,
  };
}

function NetworkGraph({ data, settings }) {
  const pointsRef = useRef();
  const linesRef = useRef();
  const groupRef = useRef();
  const animatedPositions = useMemo(() => data.basePositions.slice(), [data.basePositions]);
  const linePositions = useMemo(() => new Float32Array(data.edges.length * 3), [data.edges]);
  const dataRef = useRef({ data, settings });

  useEffect(() => {
    dataRef.current = { data, settings };
  }, [data, settings]);

  useEffect(() => {
    if (!pointsRef.current || !linesRef.current) return;
    const pointPositionAttr = pointsRef.current.geometry.attributes.position;
    if (pointPositionAttr) {
      pointPositionAttr.usage = THREE.DynamicDrawUsage;
    }
    const linePositionAttr = linesRef.current.geometry.attributes.position;
    if (linePositionAttr) {
      linePositionAttr.usage = THREE.DynamicDrawUsage;
    }
  }, [animatedPositions, linePositions]);

  useFrame(({ clock }) => {
    const { data: currentData, settings: currentSettings } = dataRef.current;
    const t = clock.getElapsedTime();
    const nodeCount = currentData.basePositions.length / 3;
    const pulse = currentSettings.pulseStrength;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * currentSettings.spin;
    }

    for (let i = 0; i < nodeCount; i += 1) {
      const idx = i * 3;
      const baseX = currentData.basePositions[idx];
      const baseY = currentData.basePositions[idx + 1];
      const baseZ = currentData.basePositions[idx + 2];
      const phase = currentData.modulations[i];
      const wobble = Math.sin(t * 0.9 + phase) * pulse;
      const radial = Math.sin(t * 0.4 + i * 0.07) * pulse * 0.6;

      animatedPositions[idx] = baseX + wobble * 0.6 + radial * baseX * 0.03;
      animatedPositions[idx + 1] = baseY + wobble;
      animatedPositions[idx + 2] = baseZ + wobble * 0.6 + radial * baseZ * 0.03;
    }

    if (pointsRef.current) {
      const attr = pointsRef.current.geometry.attributes.position;
      attr.needsUpdate = true;
    }

    let lpIndex = 0;
    for (let e = 0; e < currentData.edges.length; e += 2) {
      const a = currentData.edges[e];
      const b = currentData.edges[e + 1];
      const aIdx = a * 3;
      const bIdx = b * 3;
      linePositions[lpIndex] = animatedPositions[aIdx];
      linePositions[lpIndex + 1] = animatedPositions[aIdx + 1];
      linePositions[lpIndex + 2] = animatedPositions[aIdx + 2];
      linePositions[lpIndex + 3] = animatedPositions[bIdx];
      linePositions[lpIndex + 4] = animatedPositions[bIdx + 1];
      linePositions[lpIndex + 5] = animatedPositions[bIdx + 2];
      lpIndex += 6;
    }

    if (linesRef.current) {
      const attr = linesRef.current.geometry.attributes.position;
      attr.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[animatedPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.26}
          vertexColors
          transparent
          opacity={0.95}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.42} />
      </lineSegments>
    </group>
  );
}

function NetworkStudio({ variant = 'default' }) {
  const settings = NETWORK_SCENE_SETTINGS[variant] ?? NETWORK_SCENE_SETTINGS.default;
  const data = useMemo(
    () =>
      createNetworkData({
        nodeCount: settings.nodeCount,
        radius: settings.radius,
        linkPerNode: settings.linkPerNode,
      }),
    [settings.nodeCount, settings.radius, settings.linkPerNode]
  );

  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -0.6, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.35}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.2, 0.5, 0.9]}
        fadeDistance={60}
        fadeStrength={0.3}
      />
      <NetworkGraph data={data} settings={settings} />
    </group>
  );
}

const NEURAL_STRUCTURE = [
  {
    id: 'input',
    count: 2,
    depth: -10,
    labels: ['x₁', 'x₂'],
    radius: 0.65,
  },
  {
    id: 'hidden-1',
    count: 7,
    depth: -3,
    radius: 0.58,
  },
  {
    id: 'hidden-2',
    count: 5,
    depth: 4,
    radius: 0.52,
  },
  {
    id: 'output',
    count: 1,
    depth: 11,
    labels: ['ŷ'],
    radius: 0.8,
  },
];

function createNeuralGraph(structure) {
  const layers = structure.map((layer) => {
    const spacing = 1.4;
    const width = (layer.count - 1) * spacing;
    const nodes = Array.from({ length: layer.count }, (_, index) => {
      const x = index * spacing - width / 2;
      const y = 0;
      const z = layer.depth;
      return { position: new THREE.Vector3(x, y, z) };
    });
    return { ...layer, nodes };
  });

  const connections = [];
  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const currentLayer = layers[layerIndex];
    const nextLayer = layers[layerIndex + 1];

    currentLayer.nodes.forEach((sourceNode, sourceIndex) => {
      nextLayer.nodes.forEach((targetNode, targetIndex) => {
        const weight = 0.6 + Math.random() * 0.8;
        const direction = targetNode.position.clone().sub(sourceNode.position);
        const length = direction.length();
        direction.normalize();
        connections.push({
          from: sourceNode.position.clone(),
          to: targetNode.position.clone(),
          weight,
          direction,
          length,
          id: `${currentLayer.id}-${sourceIndex}-${nextLayer.id}-${targetIndex}`,
        });
      });
    });
  }

  const offsets = [];
  let runningTotal = 0;
  layers.forEach((layer) => {
    offsets.push(runningTotal);
    runningTotal += layer.nodes.length;
  });

  return { layers, connections, offsets, totalNodes: runningTotal };
}

function NeuralNetworkGraph({ structure }) {
  const { layers, connections, offsets, totalNodes } = useMemo(
    () => createNeuralGraph(structure),
    [structure]
  );
  const linesRef = useRef();
  const nodesRef = useRef(Array.from({ length: totalNodes }));
  useEffect(() => {
    nodesRef.current = Array.from({ length: totalNodes });
  }, [totalNodes]);
  const weightColors = useMemo(() => new Float32Array(connections.length * 6), [connections.length]);
  const weightPositions = useMemo(() => new Float32Array(connections.length * 6), [connections.length]);
  const phases = useMemo(() => connections.map(() => Math.random() * Math.PI * 2), [connections.length]);
  const pulseProgress = useMemo(() => connections.map(() => Math.random()), [connections.length]);
  const pulseSpeed = useMemo(() => connections.map(() => 0.25 + Math.random() * 0.35), [connections.length]);
  const pulseMeshRef = useRef();
  const pulseMatrix = useMemo(() => new THREE.Object3D(), []);
  const pulseGeometry = useMemo(() => new THREE.SphereGeometry(0.25, 16, 16), []);
  const pulseMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#88dbffff',
        emissive: '#fcff4aff',
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
        vertexColors: true,
      }),
    []
  );
  const pulseColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!linesRef.current) return;
    connections.forEach((connection, index) => {
      const idx = index * 6;
      weightPositions[idx] = connection.from.x;
      weightPositions[idx + 1] = connection.from.y;
      weightPositions[idx + 2] = connection.from.z;
      weightPositions[idx + 3] = connection.to.x;
      weightPositions[idx + 4] = connection.to.y;
      weightPositions[idx + 5] = connection.to.z;
    });

    const geometry = linesRef.current.geometry;
    geometry.setAttribute('position', new THREE.BufferAttribute(weightPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(weightColors, 3));
    geometry.computeBoundingSphere();
  }, [connections, weightPositions, weightColors]);

  useEffect(() => {
    if (!pulseMeshRef.current) return;
    for (let i = 0; i < connections.length; i += 1) {
      pulseMeshRef.current.setColorAt(i, pulseColor.set('#38bdf8'));
      pulseMeshRef.current.setMatrixAt(i, new THREE.Matrix4());
    }
    pulseMeshRef.current.instanceMatrix.needsUpdate = true;
    if (pulseMeshRef.current.instanceColor) {
      pulseMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [connections.length, pulseColor]);

  useFrame(({ clock }) => {
    const delta = clock.getDelta();
    const t = clock.getElapsedTime();
    const color = new THREE.Color();
    connections.forEach((connection, index) => {
      const idx = index * 6;
      const intensity = 0.4 + 0.35 * Math.sin(t * 1.3 + phases[index]) * connection.weight;
      color.setHSL(0.58 - connection.weight * 0.12, 0.65, 0.55 + intensity * 0.1);
      weightColors[idx] = color.r;
      weightColors[idx + 1] = color.g;
      weightColors[idx + 2] = color.b;
      weightColors[idx + 3] = color.r;
      weightColors[idx + 4] = color.g;
      weightColors[idx + 5] = color.b;
    });

    if (linesRef.current) {
      linesRef.current.geometry.attributes.color.needsUpdate = true;
    }

    nodesRef.current.forEach((mesh, index) => {
      if (!mesh) return;
      const pulse = 1 + 0.12 * Math.sin(t * 2 + index * 0.5);
      mesh.scale.setScalar(pulse);
      const material = mesh.material;
      material.emissiveIntensity = 0.9 + 0.35 * Math.sin(t * 1.4 + index * 0.6);
      material.color.setHSL(0.55 + 0.05 * Math.sin(t * 0.8 + index), 0.2 + 0.1 * Math.sin(t + index), 0.92);
    });

    if (pulseMeshRef.current) {
      connections.forEach((connection, index) => {
        pulseProgress[index] += pulseSpeed[index] * delta;
        if (pulseProgress[index] > 1) {
          pulseProgress[index] -= 1;
        }
        const position = connection.from.clone().addScaledVector(connection.direction, connection.length * pulseProgress[index]);
        const scale = 0.25 + 0.35 * Math.sin((pulseProgress[index] + t) * Math.PI);
        pulseMatrix.position.copy(position);
        pulseMatrix.scale.setScalar(scale);
        pulseMatrix.lookAt(connection.to);
        pulseMatrix.updateMatrix();
        pulseMeshRef.current.setMatrixAt(index, pulseMatrix.matrix);
        const glowIntensity = 0.7 + 0.5 * Math.sin(t * 1.6 + index);
        pulseColor.setHSL(0.5 + 0.08 * Math.sin(t + index + pulseProgress[index] * Math.PI), 0.7, 0.6 + glowIntensity * 0.05);
        pulseMeshRef.current.setColorAt(index, pulseColor);
      });
      pulseMeshRef.current.instanceMatrix.needsUpdate = true;
      if (pulseMeshRef.current.instanceColor) {
        pulseMeshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <lineSegments ref={linesRef}>
        <bufferGeometry />
        <lineBasicMaterial vertexColors transparent opacity={0.95} />
      </lineSegments>
      <instancedMesh ref={pulseMeshRef} args={[pulseGeometry, pulseMaterial, connections.length]} />
      {layers.map((layer, layerIdx) => (
        <group key={layer.id}>
          {layer.nodes.map((node, nodeIdx) => (
            <mesh
              key={`${layer.id}-${nodeIdx}`}
              position={node.position}
              ref={(instance) => {
                nodesRef.current[offsets[layerIdx] + nodeIdx] = instance;
              }}
            >
              <sphereGeometry args={[layer.radius ?? 0.4, 24, 24]} />
              <meshStandardMaterial
                color="#f8fafc"
                emissive="#38bdf8"
                emissiveIntensity={0.6}
                roughness={0.35}
                metalness={0.1}
              />
            </mesh>
          ))}
          {layer.labels ? (
            layer.labels.map((label, labelIdx) => {
              const node = layer.nodes[labelIdx] ?? layer.nodes[0];
              const labelOffset = (layer.radius ?? 0.4) * 2.1;
              return (
                <Html key={`${layer.id}-label-${labelIdx}`} position={node.position.clone().add(new THREE.Vector3(0, -labelOffset, 0))}>
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: '999px',
                      background: 'rgba(15,23,42,0.75)',
                      border: '1px solid rgba(148,163,184,0.4)',
                      color: '#e2e8f0',
                      fontSize: '0.7rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {label}
                  </div>
                </Html>
              );
            })
          ) : null}
        </group>
      ))}
    </group>
  );
}

function NeuralNetworkStudio() {
  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -6.5, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.45}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.3, 0.45, 0.9]}
        fadeDistance={60}
      />
      <NeuralNetworkGraph structure={NEURAL_STRUCTURE} />
    </group>
  );
}

function integrateLorenz({ sigma, rho, beta, dt, steps, discard, initial, scale }) {
  const totalPoints = steps - discard;
  const positions = new Float32Array(totalPoints * 3);
  const zValues = new Float32Array(totalPoints);

  let x = initial[0];
  let y = initial[1];
  let z = initial[2];

  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let step = 0; step < steps; step += 1) {
    const dx1 = sigma * (y - x);
    const dy1 = x * (rho - z) - y;
    const dz1 = x * y - beta * z;

    const x2 = x + dx1 * dt * 0.5;
    const y2 = y + dy1 * dt * 0.5;
    const z2 = z + dz1 * dt * 0.5;
    const dx2 = sigma * (y2 - x2);
    const dy2 = x2 * (rho - z2) - y2;
    const dz2 = x2 * y2 - beta * z2;

    const x3 = x + dx2 * dt * 0.5;
    const y3 = y + dy2 * dt * 0.5;
    const z3 = z + dz2 * dt * 0.5;
    const dx3 = sigma * (y3 - x3);
    const dy3 = x3 * (rho - z3) - y3;
    const dz3 = x3 * y3 - beta * z3;

    const x4 = x + dx3 * dt;
    const y4 = y + dy3 * dt;
    const z4 = z + dz3 * dt;
    const dx4 = sigma * (y4 - x4);
    const dy4 = x4 * (rho - z4) - y4;
    const dz4 = x4 * y4 - beta * z4;

    x += (dt / 6) * (dx1 + 2 * dx2 + 2 * dx3 + dx4);
    y += (dt / 6) * (dy1 + 2 * dy2 + 2 * dy3 + dy4);
    z += (dt / 6) * (dz1 + 2 * dz2 + 2 * dz3 + dz4);

    if (step >= discard) {
      const writeIndex = step - discard;
      const px = x * scale;
      const py = y * scale;
      const pz = z * scale;
      positions[writeIndex * 3] = px;
      positions[writeIndex * 3 + 1] = py;
      positions[writeIndex * 3 + 2] = pz;
      zValues[writeIndex] = pz;
      minZ = Math.min(minZ, pz);
      maxZ = Math.max(maxZ, pz);
    }
  }

  const colors = new Float32Array(totalPoints * 3);
  const color = new THREE.Color();
  const hueShift = seededRandom() * 0.2 - 0.1;
  const span = maxZ - minZ || 1;

  for (let i = 0; i < totalPoints; i += 1) {
    const zNorm = (zValues[i] - minZ) / span;
    const progression = i / (totalPoints - 1 || 1);
    color.setHSL(0.55 + hueShift + 0.18 * (zNorm - 0.5), 0.65, 0.35 + 0.45 * progression);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  return { positions, colors, totalPoints };
}

function LorenzAttractor() {
  const data = useMemo(() => integrateLorenz(LORENZ_DEFAULTS), []);
  const lineRef = useRef();
  const headRef = useRef();
  const progressRef = useRef(0);

  useEffect(() => {
    if (!lineRef.current) return;
    lineRef.current.geometry.setDrawRange(0, 2);
    lineRef.current.geometry.computeBoundingSphere();
  }, [data.totalPoints]);

  useFrame((_, delta) => {
    if (!lineRef.current || !headRef.current) return;
    progressRef.current += delta * (data.totalPoints / 6.5);
    if (progressRef.current >= data.totalPoints) {
      progressRef.current -= data.totalPoints;
    }
    const drawCount = Math.max(2, Math.floor(progressRef.current));
    lineRef.current.geometry.setDrawRange(0, drawCount);
    const headIndex = (drawCount - 1 + data.totalPoints) % data.totalPoints;
    const hx = data.positions[headIndex * 3];
    const hy = data.positions[headIndex * 3 + 1];
    const hz = data.positions[headIndex * 3 + 2];
    headRef.current.position.set(hx, hy, hz);
  });

  return (
    <group>
      <line ref={lineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.95} />
      </line>
      <mesh ref={headRef} frustumCulled={false}>
        <sphereGeometry args={[0.35, 20, 20]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.85} roughness={0.2} metalness={0.1} />
      </mesh>
    </group>
  );
}

function LorenzStudio() {
  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -8, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.4}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.25, 0.5, 0.85]}
        fadeDistance={60}
        fadeStrength={0.3}
      />
      <group rotation={[-Math.PI / 2.3, Math.PI / 6, 0]}>
        <LorenzAttractor />
      </group>
    </group>
  );
}

function createRegressionDataset({ sampleCount, xRange, zRange, noiseSigma, plane, gridResolution }) {
  const rng = mulberry32(0x9b3c4a);
  const samples = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < sampleCount; i += 1) {
    const tx = rng();
    const tz = rng();
    const x = THREE.MathUtils.lerp(xRange[0], xRange[1], tx);
    const z = THREE.MathUtils.lerp(zRange[0], zRange[1], tz);
    const planePred = plane.a * x + plane.b * z + plane.c;
    const y = planePred + gaussianRandom() * noiseSigma;
    samples.push({ x, z, y, plane: planePred });
    minY = Math.min(minY, y, planePred);
    maxY = Math.max(maxY, y, planePred);
  }

  const pointPositions = new Float32Array(sampleCount * 3);
  const pointColors = new Float32Array(sampleCount * 3);
  const residualPositions = new Float32Array(sampleCount * 6);
  const residualColors = new Float32Array(sampleCount * 6);
  const pointColor = new THREE.Color();
  const residualColor = new THREE.Color();

  for (let i = 0; i < sampleCount; i += 1) {
    const { x, z, y, plane: planePred } = samples[i];
    const norm = (y - minY) / (maxY - minY || 1);
    pointColor.setHSL(0.55 - 0.1 * norm, 0.55, 0.55 + 0.2 * norm);
    pointPositions[i * 3] = x;
    pointPositions[i * 3 + 1] = y;
    pointPositions[i * 3 + 2] = z;
    pointColors[i * 3] = pointColor.r;
    pointColors[i * 3 + 1] = pointColor.g;
    pointColors[i * 3 + 2] = pointColor.b;

    const residualIdx = i * 6;
    residualPositions[residualIdx] = x;
    residualPositions[residualIdx + 1] = planePred;
    residualPositions[residualIdx + 2] = z;
    residualPositions[residualIdx + 3] = x;
    residualPositions[residualIdx + 4] = y;
    residualPositions[residualIdx + 5] = z;

    const isPositive = y >= planePred;
    residualColor.set(isPositive ? '#f87171' : '#38bdf8');
    residualColors[residualIdx] = residualColor.r;
    residualColors[residualIdx + 1] = residualColor.g;
    residualColors[residualIdx + 2] = residualColor.b;
    residualColors[residualIdx + 3] = residualColor.r;
    residualColors[residualIdx + 4] = residualColor.g;
    residualColors[residualIdx + 5] = residualColor.b;
  }

  const planePositions = new Float32Array(gridResolution * gridResolution * 3);
  const planeIndices = [];
  const planeNormals = new Float32Array(gridResolution * gridResolution * 3);
  const planeUVs = new Float32Array(gridResolution * gridResolution * 2);

  let pIndex = 0;
  for (let gz = 0; gz < gridResolution; gz += 1) {
    const tz = gz / (gridResolution - 1);
    const z = THREE.MathUtils.lerp(zRange[0], zRange[1], tz);
    for (let gx = 0; gx < gridResolution; gx += 1) {
      const tx = gx / (gridResolution - 1);
      const x = THREE.MathUtils.lerp(xRange[0], xRange[1], tx);
      const y = plane.a * x + plane.b * z + plane.c;
      planePositions[pIndex * 3] = x;
      planePositions[pIndex * 3 + 1] = y;
      planePositions[pIndex * 3 + 2] = z;
      planeNormals[pIndex * 3] = 0;
      planeNormals[pIndex * 3 + 1] = 1;
      planeNormals[pIndex * 3 + 2] = 0;
      planeUVs[pIndex * 2] = tx;
      planeUVs[pIndex * 2 + 1] = tz;
      pIndex += 1;
    }
  }

  for (let gz = 0; gz < gridResolution - 1; gz += 1) {
    for (let gx = 0; gx < gridResolution - 1; gx += 1) {
      const a = gx + gz * gridResolution;
      const b = gx + (gz + 1) * gridResolution;
      const c = gx + 1 + gz * gridResolution;
      const d = gx + 1 + (gz + 1) * gridResolution;
      planeIndices.push(a, b, c, c, b, d);
    }
  }

  const planeGeometry = new THREE.BufferGeometry();
  planeGeometry.setAttribute('position', new THREE.BufferAttribute(planePositions, 3));
  planeGeometry.setAttribute('normal', new THREE.BufferAttribute(planeNormals, 3));
  planeGeometry.setAttribute('uv', new THREE.BufferAttribute(planeUVs, 2));
  planeGeometry.setIndex(planeIndices);
  planeGeometry.computeVertexNormals();

  return {
    pointPositions,
    pointColors,
    residualPositions,
    residualColors,
    planeGeometry,
  };
}

function RegressionScene() {
  const data = useMemo(() => createRegressionDataset(REGRESSION_CONFIG), []);
  const lineRef = useRef();
  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const t = clock.getElapsedTime();
    const material = lineRef.current.material;
    material.opacity = 0.65 + 0.2 * Math.sin(t * 1.2);
  });

  const axisSetup = useMemo(() => {
    const arrowHeight = 0.9;
    const makeGeometry = (length) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, Math.max(length - arrowHeight, 0.001), 0]), 3)
      );
      return geom;
    };
    const xLength = Math.abs(REGRESSION_CONFIG.xRange[1]) * 1.15;
    const zLength = Math.abs(REGRESSION_CONFIG.zRange[1]) * 1.15;
    const yLength = REGRESSION_CONFIG.plane.c + 7.5;
    return {
      arrowHeight,
      axes: [
        {
          key: 'x',
          color: '#ef4444',
          geometry: makeGeometry(xLength),
          quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)),
          length: xLength,
        },
        {
          key: 'y',
          color: '#22c55e',
          geometry: makeGeometry(yLength),
          quaternion: new THREE.Quaternion(),
          length: yLength,
        },
        {
          key: 'z',
          color: '#3b82f6',
          geometry: makeGeometry(zLength),
          quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)),
          length: zLength,
        },
      ],
    };
  }, []);

  return (
    <group rotation={[-Math.PI / 3, Math.PI / 6, 0]}>
      {axisSetup.axes.map((axis) => (
        <group key={axis.key} quaternion={axis.quaternion}>
          <lineSegments>
            <primitive object={axis.geometry} attach="geometry" />
            <lineBasicMaterial color={axis.color} transparent opacity={0.85} />
          </lineSegments>
          <mesh position={[0, axis.length - axisSetup.arrowHeight * 0.5, 0]}>
            <coneGeometry args={[0.25, axisSetup.arrowHeight, 18]} />
            <meshStandardMaterial color={axis.color} emissive={axis.color} emissiveIntensity={0.35} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh geometry={data.planeGeometry} receiveShadow castShadow>
        <meshStandardMaterial color="#cbd5f5" transparent opacity={0.32} metalness={0.1} roughness={0.6} />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.pointPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.pointColors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.25} vertexColors sizeAttenuation depthWrite={false} />
      </points>
      <lineSegments ref={lineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.residualPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.residualColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

function RegressionStudio() {
  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -6.5, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.45}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.45, 0.45, 0.75]}
        fadeDistance={60}
        fadeStrength={0.25}
      />
      <RegressionScene />
    </group>
  );
}

function BellCurveScene() {
  const {
    ballCount,
    pegRows,
    horizontalStep,
    spawnHeight,
    groundY,
    gravity,
    binCount,
    binWidth,
    jitterZ,
    gaussianSigma,
    gaussianMean,
    gaussianAmplitude,
  } = BELL_CURVE_CONFIG;

  const ballRadius = binWidth * 0.35;
  const diameter = ballRadius * 2 * 0.92;
  const minX = -(binCount * binWidth) / 2;
  const maxX = (binCount * binWidth) / 2;

  const state = useMemo(() => {
    const rng = mulberry32(0x51a3c4);
    const positions = new Float32Array(ballCount * 3);
    const velocities = new Float32Array(ballCount);
    const stages = new Float32Array(ballCount);
    const releaseTimes = new Float32Array(ballCount);
    const initialX = new Float32Array(ballCount);
    const initialY = new Float32Array(ballCount);
    const initialZ = new Float32Array(ballCount);
    const released = new Uint8Array(ballCount);
    const binAssignments = new Int16Array(ballCount).fill(-1);
    const settledX = new Float32Array(ballCount);
    const settledY = new Float32Array(ballCount);
    const binCounts = new Float32Array(binCount);
    const pathChoices = new Int8Array(ballCount * pegRows);

    const cols = Math.ceil(Math.sqrt(ballCount));
    const rows = Math.ceil(ballCount / cols);
    const gridSpacingX = binWidth * 0.78;
    const gridSpacingY = 0.65;
    const startX = -((cols - 1) * gridSpacingX) / 2;
    const startY = spawnHeight + rows * gridSpacingY + 4.2;

    for (let i = 0; i < ballCount; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * gridSpacingX;
      const y = startY - row * gridSpacingY;
      initialX[i] = x;
      initialY[i] = y;
      initialZ[i] = 0;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = 0;
      releaseTimes[i] = row * 0.35 + col * 0.05;
      for (let p = 0; p < pegRows; p += 1) {
        pathChoices[i * pegRows + p] = rng() < 0.5 ? -1 : 1;
      }
    }

    return {
      positions,
      velocities,
      stages,
      releaseTimes,
      initialX,
      initialY,
      initialZ,
      released,
      binAssignments,
      settledX,
      settledY,
      binCounts,
      pathChoices,
    };
  }, [ballCount, binCount, binWidth, pegRows, spawnHeight]);

  const ballMeshRef = useRef();
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);

  const rowSpacing = useMemo(
    () => (spawnHeight - (groundY + 2.2)) / (pegRows + 1),
    [spawnHeight, groundY, pegRows]
  );

  const gaussianGeometry = useMemo(() => {
    const segments = 240;
    const positions = new Float32Array(segments * 3);
    const range = maxX - minX;
    for (let i = 0; i < segments; i += 1) {
      const t = i / (segments - 1);
      const x = minX + range * t;
      const pdf =
        (1 / (gaussianSigma * Math.sqrt(2 * Math.PI))) *
        Math.exp(-((x - gaussianMean) ** 2) / (2 * gaussianSigma * gaussianSigma));
      const y = groundY + gaussianAmplitude * pdf;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = 0;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [gaussianSigma, gaussianMean, gaussianAmplitude, minX, maxX, groundY]);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime();
    const {
      positions,
      velocities,
      stages,
      releaseTimes,
      initialX,
      initialY,
      initialZ,
      released,
      binAssignments,
      settledX,
      settledY,
      binCounts,
      pathChoices,
    } = state;

    for (let i = 0; i < ballCount; i += 1) {
      const idx = i * 3;

      if (!released[i]) {
        if (elapsed >= releaseTimes[i]) {
          released[i] = 1;
          positions[idx] = initialX[i];
          positions[idx + 1] = spawnHeight;
          positions[idx + 2] = (Math.random() * 2 - 1) * jitterZ;
          velocities[i] = 0;
          stages[i] = 0;
        } else {
          tempPosition.set(initialX[i], initialY[i], initialZ[i]);
          tempScale.setScalar(ballRadius);
          tempQuaternion.identity();
          tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
          if (ballMeshRef.current) ballMeshRef.current.setMatrixAt(i, tempMatrix);
          continue;
        }
      }

      if (binAssignments[i] !== -1) {
        positions[idx] = settledX[i];
        positions[idx + 1] = settledY[i];
        positions[idx + 2] = 0;
      } else {
        velocities[i] += gravity * delta;
        positions[idx + 1] += velocities[i] * delta;

        const stage = stages[i];
        if (stage < pegRows) {
          const threshold = spawnHeight - (stage + 1) * rowSpacing;
          if (positions[idx + 1] <= threshold) {
            const choice = pathChoices[i * pegRows + stage] || 1;
            positions[idx] += choice * horizontalStep;
            positions[idx] = THREE.MathUtils.clamp(
              positions[idx],
              minX + binWidth * 0.35,
              maxX - binWidth * 0.35
            );
            stages[i] = stage + 1;
          }
        }

        if (positions[idx + 1] <= groundY + ballRadius) {
          const rawBin = Math.floor((positions[idx] - minX) / binWidth);
          const binIndex = THREE.MathUtils.clamp(rawBin, 0, binCount - 1);
          const centerX = minX + binWidth * (binIndex + 0.5);
          const count = (binCounts[binIndex] += 1);
          const stackY = groundY + ballRadius + (count - 1) * diameter;
          positions[idx] = centerX;
          positions[idx + 1] = stackY;
          positions[idx + 2] = 0;
          velocities[i] = 0;
          binAssignments[i] = binIndex;
          settledX[i] = centerX;
          settledY[i] = stackY;
        }
      }

      tempPosition.set(positions[idx], positions[idx + 1], positions[idx + 2]);
      tempScale.setScalar(ballRadius);
      tempQuaternion.identity();
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      if (ballMeshRef.current) {
        ballMeshRef.current.setMatrixAt(i, tempMatrix);
      }
    }

    if (ballMeshRef.current) {
      ballMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <line geometry={gaussianGeometry}>
        <lineBasicMaterial color="#f8fafc" transparent opacity={0.6} />
      </line>
      <instancedMesh ref={ballMeshRef} args={[null, null, ballCount]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.35} roughness={0.35} />
      </instancedMesh>
    </group>
  );
}

function BellCurveStudio() {
  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -9.5, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.45}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.25, 0.45, 0.65]}
        fadeDistance={60}
        fadeStrength={0.28}
      />
      <BellCurveScene />
    </group>
  );
}

const MARKOV_CHAIN_CONFIG = {
  labels: ['State A', 'State B', 'State C', 'State D', 'State E'],
  colors: ['#38bdf8', '#22d3ee', '#14b8a6', '#f97316', '#a855f7'],
  transitions: [
    [0.05, 0.45, 0.25, 0.2, 0.05],
    [0.12, 0.05, 0.48, 0.25, 0.1],
    [0.22, 0.15, 0.04, 0.36, 0.23],
    [0.18, 0.2, 0.28, 0.06, 0.28],
    [0.35, 0.18, 0.24, 0.16, 0.07],
  ],
};

function createMarkovChainData() {
  const stateCount = MARKOV_CHAIN_CONFIG.labels.length;
  const radius = 6.2;
  const states = MARKOV_CHAIN_CONFIG.labels.map((label, index) => {
    const angle = (index / stateCount) * Math.PI * 2;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    );
    return {
      id: `markov-${index}`,
      index,
      label,
      position,
      color: MARKOV_CHAIN_CONFIG.colors[index % MARKOV_CHAIN_CONFIG.colors.length],
    };
  });

  const transitions = MARKOV_CHAIN_CONFIG.transitions;
  const cumulative = transitions.map((row) => {
    const cumulativeRow = [];
    let runningTotal = 0;
    row.forEach((weight) => {
      runningTotal += weight;
      cumulativeRow.push(runningTotal);
    });
    cumulativeRow[cumulativeRow.length - 1] = 1;
    return cumulativeRow;
  });

  const edgeCount = transitions.reduce(
    (acc, row) => acc + row.reduce((inner, weight) => inner + (weight > 0.04 ? 1 : 0), 0),
    0
  );
  const edgePositions = new Float32Array(edgeCount * 6);
  const edgeColors = new Float32Array(edgeCount * 6);
  const tempColor = new THREE.Color();
  let pointer = 0;

  transitions.forEach((row, fromIndex) => {
    row.forEach((weight, toIndex) => {
      if (weight <= 0.04) return;
      const from = states[fromIndex].position;
      const to = states[toIndex].position;
      edgePositions[pointer] = from.x;
      edgePositions[pointer + 1] = from.y;
      edgePositions[pointer + 2] = from.z;
      edgePositions[pointer + 3] = to.x;
      edgePositions[pointer + 4] = to.y;
      edgePositions[pointer + 5] = to.z;
      tempColor.set(states[toIndex].color).lerp(new THREE.Color('#0f172a'), 0.45 - weight * 0.2);
      edgeColors[pointer] = tempColor.r;
      edgeColors[pointer + 1] = tempColor.g;
      edgeColors[pointer + 2] = tempColor.b;
      edgeColors[pointer + 3] = tempColor.r;
      edgeColors[pointer + 4] = tempColor.g;
      edgeColors[pointer + 5] = tempColor.b;
      pointer += 6;
    });
  });

  return {
    states,
    transitions,
    cumulative,
    edgePositions,
    edgeColors,
    edgeCount,
  };
}

function MarkovStateNode({ state, index, isActive }) {
  const meshRef = useRef();
  useFrame(({ clock }, delta) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + 0.06 * Math.sin(t * 1.2 + index);
    const targetScale = (isActive ? 1.25 : 1) * pulse;
    meshRef.current.scale.setScalar(THREE.MathUtils.damp(meshRef.current.scale.x, targetScale, 6, delta));
    const material = meshRef.current.material;
    if (material) {
      const targetEmissive = isActive ? 0.9 : 0.32;
      material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, targetEmissive, 8, delta);
    }
  });

  return (
    <group position={state.position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.62, 32, 32]} />
        <meshStandardMaterial color={state.color} emissive={state.color} emissiveIntensity={isActive ? 0.8 : 0.3} roughness={0.35} metalness={0.28} />
      </mesh>
      <Html position={[0, 1.3, 0]} center>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: '999px',
            border: '1px solid rgba(148,163,184,0.26)',
            background: 'rgba(15,23,42,0.68)',
            fontSize: '0.7rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'rgba(226,232,240,0.85)',
            fontWeight: 600,
          }}
        >
          {state.label}
        </div>
      </Html>
    </group>
  );
}

function MarkovChainScene() {
  const data = useMemo(() => createMarkovChainData(), []);
  const highlightGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return geometry;
  }, []);
  const edgeGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.edgePositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.edgeColors, 3));
    return geometry;
  }, [data.edgePositions, data.edgeColors]);
  const walkerRef = useRef();
  const transitionRef = useRef({
    current: 0,
    next: 1,
    progress: 0,
  });
  const rngRef = useRef(mulberry32(0x9d11ab4));
  const [activeStateIndex, setActiveStateIndex] = useState(0);
  const tempVector = useMemo(() => new THREE.Vector3(), []);

  const selectNextState = useCallback(
    (fromIndex) => {
      const roll = rngRef.current();
      const cumulative = data.cumulative[fromIndex];
      for (let i = 0; i < cumulative.length; i += 1) {
        if (roll <= cumulative[i]) {
          return i;
        }
      }
      return cumulative.length - 1;
    },
    [data.cumulative]
  );

  useEffect(() => {
    transitionRef.current.next = selectNextState(transitionRef.current.current);
  }, [selectNextState]);

  useEffect(() => {
    const start = data.states[transitionRef.current.current].position;
    if (walkerRef.current) {
      walkerRef.current.position.copy(start);
    }
    const attr = highlightGeometry.attributes.position;
    attr.setXYZ(0, start.x, start.y, start.z);
    attr.setXYZ(1, start.x, start.y, start.z);
    attr.needsUpdate = true;
  }, [data.states, highlightGeometry]);

  useFrame(({ clock }, delta) => {
    const { current, next } = transitionRef.current;
    const progress = (transitionRef.current.progress += delta * 0.45);
    const startPosition = data.states[current].position;
    const endPosition = data.states[next].position;
    const eased = 0.5 - 0.5 * Math.cos(Math.min(progress, 1) * Math.PI);
    tempVector.copy(startPosition).lerp(endPosition, eased);
    if (walkerRef.current) {
      walkerRef.current.position.copy(tempVector);
    }
    const attr = highlightGeometry.attributes.position;
    attr.setXYZ(0, startPosition.x, startPosition.y, startPosition.z);
    attr.setXYZ(1, tempVector.x, tempVector.y, tempVector.z);
    attr.needsUpdate = true;
    if (progress >= 1) {
      transitionRef.current.current = next;
      const upcoming = selectNextState(next);
      transitionRef.current.next = upcoming;
      transitionRef.current.progress = 0;
      setActiveStateIndex(next);
    }
  });

  return (
    <group position={[0, -9, 0]}>
      <Grid
        renderOrder={-1}
        position={[0, -0.8, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.35}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={[0.32, 0.58, 0.86]}
        fadeDistance={60}
        fadeStrength={0.32}
      />
      <lineSegments geometry={edgeGeometry} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.32} />
      </lineSegments>
      <line geometry={highlightGeometry} frustumCulled={false}>
        <lineBasicMaterial color="#fbbf24" transparent opacity={0.85} linewidth={2} />
      </line>
      {data.states.map((state, idx) => (
        <MarkovStateNode key={state.id} state={state} index={idx} isActive={idx === activeStateIndex} />
      ))}
      <mesh ref={walkerRef} frustumCulled={false}>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshStandardMaterial color="#fef08a" emissive="#facc15" emissiveIntensity={1.2} roughness={0.2} metalness={0.35} />
      </mesh>
    </group>
  );
}

function MarkovStudio() {
  return <MarkovChainScene />;
}

const LINEAR_PRESET = {
  transformScale: 1,
  warpBase: 0.08,
  warpOscillation: 0.05,
};

function getAnimatedTransform(time, profile = LINEAR_PRESET) {
  const scaleFactor = profile.transformScale ?? 1;
  const scaleX = 1 + 0.27 * scaleFactor * Math.sin(time * 0.6);
  const scaleZ = 1 - 0.22 * scaleFactor * Math.cos(time * 0.45);
  const shear = 0.42 * scaleFactor * Math.sin(time * 0.8);
  const rotation = (Math.PI / 8) * scaleFactor * Math.sin(time * 0.35);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const shearTerm = shear * scaleZ;

  const a = cos * scaleX;
  const b = cos * shearTerm - sin * scaleZ;
  const c = sin * scaleX;
  const d = sin * shearTerm + cos * scaleZ;
  const determinant = a * d - b * c;

  return {
    matrix: { a, b, c, d },
    components: { scaleX, scaleZ, shear, rotation },
    determinant,
  };
}

function warpPoint(x, z, time, strength = 0.1) {
  const radius = Math.sqrt(x * x + z * z);
  if (radius === 0) {
    return { x, z };
  }
  const angle = Math.atan2(z, x);
  const normalized = Math.tanh(radius * 0.28);
  const wave = strength * (0.6 + 0.4 * Math.sin(time * 0.45 + radius * 0.25));
  const distortedRadius = radius + wave * normalized * 1.2;
  const twist = 0.12 * strength * Math.sin(time * 0.22 + radius * 0.3);
  const finalAngle = angle + twist;
  return {
    x: distortedRadius * Math.cos(finalAngle),
    z: distortedRadius * Math.sin(finalAngle),
  };
}

function WarpedGrid({ divisions = 18, extent = 9, segments = 48, height = -0.6 }) {
  const segmentData = useMemo(() => {
    const linesPerAxis = divisions * 2 + 1;
    const step = (extent * 2) / segments;
    const totalSegments = linesPerAxis * segments * 2;
    const base = new Float32Array(totalSegments * 4);
    let offset = 0;
    for (let i = -divisions; i <= divisions; i += 1) {
      const t = divisions === 0 ? 0 : i / divisions;
      const x = t * extent;
      for (let s = 0; s < segments; s += 1) {
        const z0 = -extent + s * step;
        const z1 = z0 + step;
        base[offset] = x;
        base[offset + 1] = z0;
        base[offset + 2] = x;
        base[offset + 3] = z1;
        offset += 4;
      }
    }
    for (let i = -divisions; i <= divisions; i += 1) {
      const t = divisions === 0 ? 0 : i / divisions;
      const z = t * extent;
      for (let s = 0; s < segments; s += 1) {
        const x0 = -extent + s * step;
        const x1 = x0 + step;
        base[offset] = x0;
        base[offset + 1] = z;
        base[offset + 2] = x1;
        base[offset + 3] = z;
        offset += 4;
      }
    }
    return { base, totalSegments };
  }, [divisions, extent, segments]);

  const animatedPositions = useMemo(
    () => new Float32Array(segmentData.totalSegments * 6),
    [segmentData.totalSegments]
  );
  const gridRef = useRef();

  useEffect(() => {
    if (!gridRef.current) return;
    const attr = gridRef.current.geometry.attributes.position;
    if (attr) {
      attr.usage = THREE.DynamicDrawUsage;
    }
  }, []);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const { matrix } = getAnimatedTransform(time, LINEAR_PRESET);
    const { a, b, c, d } = matrix;
    const { base, totalSegments } = segmentData;
    const transformStrength = 0.75 + 0.2 * Math.sin(time * 0.25);

    for (let i = 0; i < totalSegments; i += 1) {
      const baseIdx = i * 4;
      const writeIdx = i * 6;

      const sx = base[baseIdx];
      const sz = base[baseIdx + 1];
      const ex = base[baseIdx + 2];
      const ez = base[baseIdx + 3];

      const targetX0 = a * sx + b * sz;
      const targetZ0 = c * sx + d * sz;
      const targetX1 = a * ex + b * ez;
      const targetZ1 = c * ex + d * ez;

      const blendedX0 = THREE.MathUtils.lerp(sx, targetX0, transformStrength);
      const blendedZ0 = THREE.MathUtils.lerp(sz, targetZ0, transformStrength);
      const blendedX1 = THREE.MathUtils.lerp(ex, targetX1, transformStrength);
      const blendedZ1 = THREE.MathUtils.lerp(ez, targetZ1, transformStrength);

      const localStrength = LINEAR_PRESET.warpBase +
        LINEAR_PRESET.warpOscillation * Math.sin(time * 0.4 + i * 0.015);

      const warpedStart = warpPoint(blendedX0, blendedZ0, time, localStrength);
      const warpedEnd = warpPoint(blendedX1, blendedZ1, time, localStrength);

      animatedPositions[writeIdx] = warpedStart.x;
      animatedPositions[writeIdx + 1] = height;
      animatedPositions[writeIdx + 2] = warpedStart.z;
      animatedPositions[writeIdx + 3] = warpedEnd.x;
      animatedPositions[writeIdx + 4] = height;
      animatedPositions[writeIdx + 5] = warpedEnd.z;
    }

    if (gridRef.current) {
      gridRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <lineSegments ref={gridRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[animatedPositions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#67e8f9" transparent opacity={0.85} linewidth={1} />
    </lineSegments>
  );
}

function BasisVectors() {
  const yLevel = -0.55;
  const e1Positions = useMemo(() => new Float32Array([0, yLevel, 0, 1, yLevel, 0]), [yLevel]);
  const e2Positions = useMemo(() => new Float32Array([0, yLevel, 0, 0, yLevel, 1]), [yLevel]);
  const e1LineRef = useRef();
  const e2LineRef = useRef();

  useEffect(() => {
    if (e1LineRef.current) {
      const attr = e1LineRef.current.geometry.attributes.position;
      if (attr) {
        attr.usage = THREE.DynamicDrawUsage;
      }
    }
    if (e2LineRef.current) {
      const attr = e2LineRef.current.geometry.attributes.position;
      if (attr) {
        attr.usage = THREE.DynamicDrawUsage;
      }
    }
  }, []);

  useFrame(({ clock }) => {
    const { matrix } = getAnimatedTransform(clock.getElapsedTime(), LINEAR_PRESET);
    const { a, b, c, d } = matrix;
    e1Positions[3] = a;
    e1Positions[5] = c;
    e2Positions[3] = b;
    e2Positions[5] = d;

    if (e1LineRef.current) {
      e1LineRef.current.geometry.attributes.position.needsUpdate = true;
    }
    if (e2LineRef.current) {
      e2LineRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      <line ref={e1LineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[e1Positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#f97316" linewidth={2} />
      </line>
      <line ref={e2LineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[e2Positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#38bdf8" linewidth={2} />
      </line>
    </group>
  );
}

function StaticAxesAnchor({ length = 1.2, height = -0.55 }) {
  const axes = useMemo(
    () => [
      { id: 'anchor-x', direction: new THREE.Vector3(1, 0, 0), color: '#f97316', label: 'X' },
      { id: 'anchor-y', direction: new THREE.Vector3(0, 1, 0), color: '#22d3ee', label: 'Y' },
      { id: 'anchor-z', direction: new THREE.Vector3(0, 0, 1), color: '#38bdf8', label: 'Z' },
    ],
    []
  );

  return (
    <group position={[0, height, 0]}>
      {axes.map(({ id, direction, color, label }) => (
        <group key={id}>
          <AxisArrow direction={direction} length={length} color={color} opacity={0.85} />
          <Html position={direction.clone().normalize().multiplyScalar(length + 0.28)} transform center>
            <div
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                background: 'rgba(15,23,42,0.85)',
                border: '1px solid rgba(148,163,184,0.35)',
                color,
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

function DeterminantIndicator({ height = -0.6 }) {
  const ringRef = useRef();
  const materialRef = useRef();
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.45, 0.58, 64), []);

  useFrame(({ clock }) => {
    const { determinant } = getAnimatedTransform(clock.getElapsedTime(), LINEAR_PRESET);
    const scale = Math.max(0.35, Math.sqrt(Math.abs(determinant)));
    if (ringRef.current) {
      ringRef.current.scale.setScalar(scale);
    }
    if (materialRef.current) {
      const color = determinant >= 0 ? '#38bdf8' : '#f87171';
      materialRef.current.color.set(color);
      materialRef.current.opacity = 0.4 + 0.15 * Math.sin(clock.getElapsedTime() * 1.4);
    }
  });

  return (
    <mesh
      ref={ringRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, height + 0.021, 0]}
      frustumCulled={false}
    >
      <primitive object={ringGeometry} attach="geometry" />
      <meshBasicMaterial ref={materialRef} transparent opacity={0.5} />
    </mesh>
  );
}

function LinearTransformStudio() {
  return (
    <group position={[0, -9, 0]}>
      <WarpedGrid height={-0.6} />
      <StaticAxesAnchor length={2.6} height={-0.55} />
      <DeterminantIndicator height={-0.6} />
      <BasisVectors />
    </group>
  );
}

function Scene({
  controlsEnabled = true,
  backgroundMode = 'pca',
  variant = 'default',
  showGaussianCurve = true,
}) {
  return (
    <>
      {controlsEnabled ? (
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={12}
          maxDistance={80}
          maxPolarAngle={Math.PI * 0.82}
          target={[0, -6.5, 0]}
        />
      ) : null}
      <ambientLight intensity={0.55} />
      <pointLight position={[12, 18, 8]} intensity={1.4} />
      <pointLight position={[-12, -8, -10]} intensity={0.5} color="#38bdf8" />
      {backgroundMode === 'pca' ? (
        <PCAStudio mode={variant} />
      ) : backgroundMode === 'neural' ? (
        <NeuralNetworkStudio />
      ) : backgroundMode === 'lorenz' ? (
        <LorenzStudio />
      ) : backgroundMode === 'regression' ? (
        <RegressionStudio />
      ) : backgroundMode === 'network' ? (
        <NetworkStudio variant={variant} />
      ) : backgroundMode === 'bell' ? (
        <BellCurveStudio />
      ) : backgroundMode === 'markov' ? (
        <MarkovStudio />
      ) : backgroundMode === 'linear' ? (
        <LinearTransformStudio />
      ) : (
        <GaussianStudio showCurve={showGaussianCurve} />
      )}
    </>
  );
}

function HomeContent() {
  return (
    <div className="home-content">
      <h1>VIC DATASOC</h1>
      <h2>For students interested in Data Science</h2>
      <a 
      className="hero-button" 
      href="https://docs.google.com/forms/d/e/1FAIpQLScc0P19tUMbCUGOB4Cg-KcHEqPtjjicOXg7ydKgNeU5EHlU7A/viewform"
      target="_blank"
      rel="noreferrer"
      >
        Join Us!</a>
    </div>
  );
}

function AboutContent() {
  return (
    <div className="about-content">
      <h1>About VIC DataSoc</h1>
      <p>
        STARTING IN 2026 VIC DATASOC is a student-led society at Te Herenga Waka – Victoria University of Wellington that connects students across Science, Engineering, Commerce, and Maths.
Our mission is to build a collaborative community where students can learn, share, and apply data-driven skills in real-world contexts.
      </p>
      <div className="about-grid">
        <section>
          <h3>Hands-on Learning</h3>
          <p>
            Weekly build sessions pair newcomers with mentors so everyone ships experiments—from
            visualising L2 liquidity to deploying smart contract automations.
          </p>
        </section>
        <section>
          <h3>Industry Connections</h3>
          <p>
            Protocol teams host office hours and workshops, giving members insight into real
            problems and pathways to internships and research roles.
          </p>
        </section>
        <section>
          <h3>Open Source First</h3>
          <p>
            Everything we create is released openly so other builders can learn, remix, and
            accelerate their own ideas. Contributions of every size are celebrated.
          </p>
        </section>
      </div>
      <Link to="/" className="hero-button about-cta">Back to homepage</Link>
    </div>
  );
}

const events = [
  {
    id: 'bedrock',
    title: 'Amazon Bedrock Workshop',
    date: 'Thu, 8 August 2024',
    time: '6:00 PM – 8:00 PM',
    location: 'AWS Office Level 13, Commercial Bay, Auckland',
    hero: null,
    summary:
      'Hands-on exploration of Amazon Bedrock with a focus on secure generative AI patterns, agents, and knowledge bases.',
    highlights: [
      'Build secure generative AI applications on AWS with guidance from solution architects.',
      'See how agents and knowledge bases extend Bedrock for production workloads.',
      'Bring your laptop and student ID for entry.',
    ],
    cta: {
      label: 'Sign up to attend',
      href: 'https://example.com/events/bedrock',
    },
  },
  {
    id: 'google-ai',
    title: "Evening with Google's AI, Data, and Analytics Experts",
    date: 'Thu, 1 August 2024',
    time: '6:00 PM – 8:00 PM',
    location: '10 Madden Street, Auckland CBD',
    hero: null,
    summary:
      'Exclusive deep dive into Google Cloud’s data and AI tooling with live demos, product feedback sessions, and networking.',
    highlights: [
      'Hear from product managers and engineers shaping Google’s data platform.',
      'Breakout discussions on Vertex AI, BigQuery, and infrastructure best practices.',
      'Network with peers across New Zealand universities and industry partners.',
    ],
    cta: {
      label: 'Register interest',
      href: 'https://example.com/events/google-ai',
    },
  },
  {
    id: 'hackathon',
    title: 'DeFi Systems Hack Weekend',
    date: 'Sat-Sun, 14–15 September 2024',
    time: 'All weekend',
    location: 'Victoria University Innovation Hub',
    hero: null,
    summary:
      'Two-day hack sprint tackling cross-chain liquidity routing, risk dashboards, and automation bots with mentors from leading protocols.',
    highlights: [
      'Build with on-site mentors from Chainlink, Aave, and local DeFi startups.',
      'Dedicated track for first-time hackers with guided workshops.',
      'Demo day with prizes, recruitment chats, and post-event support.',
    ],
    cta: {
      label: 'Apply as a team',
      href: 'https://example.com/events/defi-weekend',
    },
  },
];

const teamSections = [
  {
    id: 'executive',
    title: 'Executive Team',
    description:
      'Steers the society, looks after partnerships, and keeps our community welcoming.',
    members: [
      {
        name: 'Nate Bradbury',
        role: 'President',
        bio: 'Coordinates the executive crew, owns the growth roadmap, and helps every project squad stay resourced.',
      },
      {
        name: 'Oliver Donaldson',
        role: 'Vice President',
        bio: 'Keeps our week-to-week operations humming and leads our mentor onboarding.',
      },
      {
        name: 'Lev Peterson',
        role: 'Treasurer',
        bio: 'Builds transparent budgets, handles funding applications, and keeps sponsorship conversations on track.',
      },
      {
        name: 'Hamish McLeod',
        role: 'Secretary',
        bio: 'Drives internal communications and ensures every event ends with actionable notes.',
      },
    ],
  },
  
];

function TeamContent() {
  return (
    <div className="team-content">
      <header className="team-hero">
        <h1>Meet the Team</h1>
        <p>
          The executive and portfolio leads who guide VIC DataSoc and support members across every project,
          workshop, and community initiative.
        </p>
      </header>
      {teamSections.map((section) => (
        <section key={section.id} className="team-section">
          <div className="team-section-heading">
            <h2>{section.title}</h2>
            <p>{section.description}</p>
          </div>
          <div className="team-grid">
            {section.members.map((member) => (
              <article key={member.name} className="team-card">
                <div className="team-card-header">
                  <span className="team-card-role">{member.role}</span>
                  <h3>{member.name}</h3>
                </div>
                <p className="team-card-bio">{member.bio}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EventsContent() {
  return (
    <div className="events-panel">
      <header className="events-hero">
        <h1>Upcoming Events</h1>
        <p>
          Think of something to say here about events. Maybe a call to action to join the mailing list or
          follow on socials to stay updated.
        </p>
      </header>
      <div className="events-scroll">
        {events.map((event) => (
          <article key={event.id} className="event-card">
            <div className="event-media" aria-hidden="true">
              <div className="event-media-fallback">{event.title.substring(0, 1)}</div>
              {event.hero ? (
                <img
                  src={event.hero}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
              <span className="event-date-tag">{event.date}</span>
            </div>
            <div className="event-body">
              <h2>{event.title}</h2>
              <dl className="event-meta">
                <div>
                  <dt>Time</dt>
                  <dd>{event.time}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{event.location}</dd>
                </div>
              </dl>
              <p className="event-summary">{event.summary}</p>
              <ul className="event-highlights">
                {event.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a className="hero-button event-cta" href={event.cta.href} target="_blank" rel="noreferrer">
                {event.cta.label}
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ConstitutionContent() {
  return (
    <div className="constitution-content">
      <header>
        <h1>VIC DataSoc Constitution</h1>
        <p>
          Last updated 6th October 2025.
        </p>
      </header>

      <div className="constitution-viewer" role="region" aria-label="Constitution document preview">
        <iframe
          src="/constitution.pdf"
          title="VIC DataSoc Constitution"
          loading="lazy"
        />
        <p className="constitution-fallback">
          Having trouble loading the preview?{' '}
          <a href="/constitution.pdf" target="_blank" rel="noreferrer">
            Open the constitution in a new tab
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function Layout() {
  const location = useLocation();
  const isAbout = location.pathname.startsWith('/about');
  const isEvents = location.pathname.startsWith('/events');
  const isTeam = location.pathname.startsWith('/team');
  const isConstitution = location.pathname.startsWith('/constitution');
  const navLinkClass = ({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`;
  const needsScroll = isEvents || isConstitution || isTeam;
  const rootClass = `app-root manrope-font${isAbout ? ' app-root--about' : ''}${needsScroll ? ' app-root--scroll' : ''}`;
  const canvasClass = isEvents || isTeam ? 'scene-canvas scene-canvas--passive' : 'scene-canvas';
  const pageContentModifier = isAbout
    ? 'page-content--about'
    : isTeam
      ? 'page-content--team'
      : isEvents
        ? 'page-content--events'
        : isConstitution
          ? 'page-content--constitution'
          : 'page-content--home';
  const routeVariant = isAbout ? 'soft' : isTeam ? 'network' : 'default';
  const backgroundOptions = useMemo(
    () => [
      { id: 'gaussian', label: 'Gaussian' },
      { id: 'linear', label: 'Linear Algebra' },
      { id: 'bell', label: 'Bell Drop' },
      { id: 'network', label: 'Network' },
      { id: 'markov', label: 'Markov Walk' },
      { id: 'neural', label: 'Neural Net' },
      { id: 'lorenz', label: 'Lorenz' },
      { id: 'regression', label: 'Regression' },
      { id: 'pca', label: 'PCA' },
    ],
    []
  );
  const [backgroundModeIndex, setBackgroundModeIndex] = useState(0);
  const activeBackground = backgroundOptions[backgroundModeIndex] ?? backgroundOptions[0];
  const backgroundDetails = useMemo(
    () => ({
      gaussian: {
        title: 'Gaussian Landscape',
        description:
          'A 3D probability surface showing how normal distributions guide uncertainty and density estimation.',
      },
      bell: {
        title: 'Galton Board',
        description:
          'Permuted balls settling into bins to illustrate how random chance forms the bell curve over many trials.',
      },
      linear: {
        title: 'Matrix Playground',
        description:
          'The floor grid warps under an animated 2x2 transform. A powerful tool in data science',
      },
      network: {
        title: 'Graph Pulse',
        description:
          'A clustered network with shimmering edges that highlights connectivity and modular structure.',
      },
      markov: {
        title: 'Markov Walk',
        description:
          'A random walker moving through weighted transitions to show how Markov chains explore state spaces.',
      },
      neural: {
        title: 'Neural Pathways',
        description:
          'Animated signal flow through a layered neural net, hinting at weights, activations, and learned features.',
      },
      lorenz: {
        title: 'Lorenz Attractor',
        description:
          'A chaotic trajectory made famous in dynamical systems, demonstrating sensitivity to initial conditions.',
      },
      regression: {
        title: 'Regression Plane',
        description:
          'Scatter points and residuals hovering around a fitted plane, capturing error structure in linear models.',
      },
      pca: {
        title: 'PCA Studio',
        description:
          'Principal components stretching through a rotating cloud to show how variance concentrates along axes.',
      },
    }),
    []
  );
  const initialBackground = backgroundOptions[0];
  const [overlayPayload, setOverlayPayload] = useState({
    id: initialBackground.id,
    title: backgroundDetails[initialBackground.id]?.title ?? initialBackground.label,
    description: backgroundDetails[initialBackground.id]?.description ?? '',
  });
  const [overlayActivated, setOverlayActivated] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const overlayTimerRef = useRef(null);
  const handlePreviousBackground = () => {
    setOverlayActivated(true);
    setBackgroundModeIndex((current) => (current - 1 + backgroundOptions.length) % backgroundOptions.length);
  };
  const handleNextBackground = () => {
    setOverlayActivated(true);
    setBackgroundModeIndex((current) => (current + 1) % backgroundOptions.length);
  };
  useEffect(() => {
    if (!overlayActivated) return;
    const detail = backgroundDetails[activeBackground.id] ?? {};
    setOverlayPayload({
      id: activeBackground.id,
      title: detail.title ?? activeBackground.label,
      description: detail.description ?? '',
    });
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setOverlayVisible(false);
    const rafId = requestAnimationFrame(() => {
      setOverlayVisible(true);
    });
    overlayTimerRef.current = setTimeout(() => {
      setOverlayVisible(false);
    }, 5200);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [activeBackground, backgroundDetails, overlayActivated]);

  useEffect(
    () => () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
    },
    []
  );

  return (
    <div className={rootClass}>
      <div className="background-toggle" role="group" aria-label="Background visual selector">
        <button
          type="button"
          className="background-toggle__button"
          onClick={handlePreviousBackground}
          aria-label="Previous background"
        >
          &lt;
        </button>
        <span className="background-toggle__label">{activeBackground.label}</span>
        <button
          type="button"
          className="background-toggle__button"
          onClick={handleNextBackground}
          aria-label="Next background"
        >
          &gt;
        </button>
      </div>
      {overlayActivated ? (
        <div
          className={`background-overlay${overlayVisible ? ' background-overlay--visible' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="background-overlay__title">{overlayPayload.title}</span>
          {overlayPayload.description ? (
            <p className="background-overlay__description">{overlayPayload.description}</p>
          ) : null}
        </div>
      ) : null}
      <header className="app-header">
        <nav className="nav-bar">
          <div className="nav-brand">
            <NavLink to="/" className="brand-link" aria-label="VIC DataSoc home">
              <div className="brand-canvas">
                <Canvas camera={{ position: [0, 0, 5] }}>
                  <ambientLight intensity={0.5} />
                  <pointLight position={[10, 10, 10]} />
                  <SpinningLogo />
                </Canvas>
              </div>
              <span className="brand-title">VDS</span>
            </NavLink>
          </div>
          <ul className="nav-links">
            <li>
              <NavLink to="/" className={navLinkClass} end>
                Home
              </NavLink>
            </li>
            <li>
              <NavLink to="/about" className={navLinkClass}>
                About
              </NavLink>
            </li>
            <li>
              <NavLink to="/events" className={navLinkClass}>
                Events
              </NavLink>
            </li>
            <li>
              <a className="nav-link" href="/#join">
                Join Us
              </a>
            </li>
            <li>
              <NavLink to="/team" className={navLinkClass}>
                Team
              </NavLink>
            </li>
            <li>
              <NavLink to="/constitution" className={navLinkClass}>
                Constitution
              </NavLink>
            </li>
            <li>
              <a className="nav-link" href="/#contact">
                
              </a>
            </li>
          </ul>
        </nav>
      </header>
      <main
        className={`page-content ${pageContentModifier}`}
      >
        <Outlet />
      </main>
      <Canvas shadows camera={{ position: [30, 30, 30], fov: 50 }} className={canvasClass}>
        <Scene
          controlsEnabled={!isEvents && !isTeam}
          backgroundMode={activeBackground.id}
          variant={routeVariant}
          showGaussianCurve={!isAbout}
        />
      </Canvas>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeContent />} />
          <Route path="/about" element={<AboutContent />} />
          <Route path="/events" element={<EventsContent />} />
          <Route path="/team" element={<TeamContent />} />
          <Route path="/constitution" element={<ConstitutionContent />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
