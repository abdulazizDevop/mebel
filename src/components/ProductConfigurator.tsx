import { useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { RotateCcw, Move3D, ZoomIn } from 'lucide-react';
import { Product, ColorVariant } from '../data/products';

/* ───── 3D Product Panel ───── */
function ProductPanel({ imageUrl, dimensions }: { imageUrl: string; dimensions: { w: number; h: number; d: number } }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, imageUrl);

  // Make texture look good
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // Gentle idle rotation
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.08;
    }
  });

  const { w, h, d } = dimensions;

  // Create materials for each face of the box
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({
      color: '#d4c8b8',
      roughness: 0.7,
      metalness: 0.05,
    });
    const back = new THREE.MeshStandardMaterial({
      color: '#c4b8a8',
      roughness: 0.8,
      metalness: 0.02,
    });
    const top = new THREE.MeshStandardMaterial({
      color: '#e0d6c8',
      roughness: 0.6,
      metalness: 0.05,
    });
    const front = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.4,
      metalness: 0.02,
    });

    // [+x, -x, +y, -y, +z (front), -z (back)]
    return [side, side, top, top, front, back];
  }, [texture]);

  return (
    <mesh ref={meshRef} position={[0, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </mesh>
  );
}

/* ───── Floor grid ───── */
function FloorGrid() {
  return (
    <group>
      {/* Subtle ellipse on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[1.8, 2.0, 64]} />
        <meshBasicMaterial color="#d0c8bc" transparent opacity={0.25} />
      </mesh>
      {/* Floor plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#f5f0e8" roughness={1} />
      </mesh>
    </group>
  );
}

/* ───── Loading fallback ───── */
function Loader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <span className="text-xs opacity-40">Загрузка 3D...</span>
      </div>
    </Html>
  );
}

/* ───── Scene ───── */
function Scene({ imageUrl, dimensions }: { imageUrl: string; dimensions: { w: number; h: number; d: number } }) {
  const controlsRef = useRef<any>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} />

      <Suspense fallback={<Loader />}>
        <ProductPanel imageUrl={imageUrl} dimensions={dimensions} />
        <FloorGrid />
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.35}
          scale={6}
          blur={2.5}
          far={4}
        />
        <Environment preset="apartment" />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        minDistance={2}
        maxDistance={8}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate={false}
        target={[0, dimensions.h / 2, 0]}
      />
    </>
  );
}

/* ───── Material options ───── */
const materialOptions = [
  { label: 'Дерево', colors: ['#8B6F47', '#A0855C', '#6B4F2E', '#C4A57B'] },
  { label: 'Ткань', colors: ['#2C2C2C', '#4A3728', '#6B6B6B', '#8E392B'] },
  { label: 'Металл', colors: ['#9CA3AF', '#D4AF37', '#1F2937', '#B87333'] },
];

const styleLabels = ['Классика', 'Модерн', 'Лофт', 'Скандинавия'];

/* ───── Main Configurator Component ───── */
interface ProductConfiguratorProps {
  product: Product;
  activeColor: number;
  onColorChange: (index: number) => void;
}

export function ProductConfigurator({ product, activeColor, onColorChange }: ProductConfiguratorProps) {
  const [activeMaterial, setActiveMaterial] = useState(0);
  const [activeStyle, setActiveStyle] = useState(0);
  const [showConfigurator, setShowConfigurator] = useState(false);

  // Parse dimensions for 3D proportions
  const dims = useMemo(() => {
    if (product.dimensions) {
      const parts = product.dimensions.split('×').map((s) => parseFloat(s.trim()) || 50);
      const maxDim = Math.max(...parts);
      const scale = 2 / maxDim; // normalize to ~2 units max
      return {
        w: (parts[0] || 50) * scale,
        h: (parts[2] || parts[0] || 50) * scale,
        d: (parts[1] || 30) * scale,
      };
    }
    return { w: 1.6, h: 1.8, d: 0.6 };
  }, [product.dimensions]);

  const currentImage = product.colorVariants[activeColor]?.image || product.image;

  return (
    <div className="relative">
      {/* 3D Canvas */}
      <div className="relative aspect-square max-w-lg mx-auto bg-gradient-to-b from-[#f5f0e8] to-[#ebe5da] rounded-[2rem] overflow-hidden shadow-inner">
        {/* "configurator" label */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <span className="text-[10px] tracking-[0.3em] uppercase opacity-30">configurator</span>
        </div>

        {/* Rotate hint arrows */}
        <div className="absolute top-1/2 left-3 -translate-y-1/2 z-10 opacity-20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </div>
        <div className="absolute top-1/2 right-3 -translate-y-1/2 z-10 opacity-20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>

        <Canvas
          shadows
          camera={{ position: [3, 3, 5], fov: 35 }}
          style={{ touchAction: 'none' }}
        >
          <Scene imageUrl={currentImage} dimensions={dims} />
        </Canvas>

        {/* Control hints at bottom of canvas */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-4">
          <div className="flex items-center gap-1 opacity-25">
            <RotateCcw size={12} />
            <span className="text-[9px]">Вращение</span>
          </div>
          <div className="flex items-center gap-1 opacity-25">
            <ZoomIn size={12} />
            <span className="text-[9px]">Масштаб</span>
          </div>
        </div>
      </div>

      {/* Units/Size display — like reference */}
      <div className="flex items-center justify-between max-w-lg mx-auto mt-5 px-2">
        <div>
          <span className="text-[10px] tracking-[0.2em] uppercase opacity-40">Units</span>
          <div className="flex items-baseline gap-2 mt-1">
            {product.dimensions ? (
              product.dimensions.split('×').map((dim, i) => (
                <span
                  key={i}
                  className={cn(
                    "transition-all cursor-pointer",
                    i === 0 ? "text-2xl font-bold" : "text-lg opacity-40"
                  )}
                >
                  {dim.trim().replace(/[^\d]/g, '')}
                </span>
              ))
            ) : (
              <span className="text-2xl font-bold">—</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] tracking-[0.2em] uppercase opacity-40">Price</span>
          <div className="text-2xl font-bold mt-1">{product.price} ₽</div>
        </div>
      </div>

      {/* Configurator sections — colour / material / fabric / style */}
      <div className="max-w-lg mx-auto mt-6 px-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Colour */}
          <div className="text-center">
            <span className="text-[10px] tracking-wider uppercase opacity-40 block mb-2">colour</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {product.colorVariants.map((variant, i) => (
                <button
                  key={i}
                  onClick={() => onColorChange(i)}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-all hover:scale-110",
                    i === activeColor
                      ? "border-primary scale-110 shadow-md ring-2 ring-primary/20 ring-offset-1"
                      : "border-primary/10"
                  )}
                  style={{ backgroundColor: variant.hex }}
                />
              ))}
            </div>
          </div>

          {/* Material */}
          <div className="text-center">
            <span className="text-[10px] tracking-wider uppercase opacity-40 block mb-2">material</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {materialOptions[0].colors.map((color, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMaterial(i)}
                  className={cn(
                    "w-7 h-7 rounded-lg border-2 transition-all hover:scale-110",
                    i === activeMaterial
                      ? "border-primary scale-110 shadow-md"
                      : "border-primary/10"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Fabric */}
          <div className="text-center">
            <span className="text-[10px] tracking-wider uppercase opacity-40 block mb-2">fabric</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {materialOptions[1].colors.map((color, i) => (
                <button
                  key={i}
                  className={cn(
                    "w-7 h-7 rounded-lg border-2 transition-all hover:scale-110",
                    i === 0
                      ? "border-primary scale-110 shadow-md"
                      : "border-primary/10"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Style */}
          <div className="text-center">
            <span className="text-[10px] tracking-wider uppercase opacity-40 block mb-2">style</span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {styleLabels.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStyle(i)}
                  className={cn(
                    "w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 text-[7px] font-bold flex items-center justify-center",
                    i === activeStyle
                      ? "border-primary bg-primary text-primary-inv shadow-md"
                      : "border-primary/10 bg-surface"
                  )}
                >
                  {label.charAt(0)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Reset button */}
        <div className="flex justify-center mt-2">
          <button
            onClick={() => {
              onColorChange(0);
              setActiveMaterial(0);
              setActiveStyle(0);
            }}
            className="px-5 py-2 rounded-full border border-primary/15 text-xs tracking-wider uppercase opacity-50 hover:opacity-100 hover:bg-primary/5 transition-all"
          >
            Сброс настроек
          </button>
        </div>
      </div>
    </div>
  );
}
