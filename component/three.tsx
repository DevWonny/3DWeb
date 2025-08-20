"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  step,
  normalWorldGeometry,
  output,
  texture,
  vec3,
  vec4,
  normalize,
  positionWorld,
  bumpMap,
  cameraPosition,
  color,
  uniform,
  mix,
  uv,
  max,
} from "three/tsl";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

export default function Earth() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }

    // 시계 생성 (프레임 간격 계산용)
    const clock = new THREE.Clock();

    // Camera Setting
    const camera = new THREE.PerspectiveCamera(
      25,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(4.5, 2, 3);

    // Scene 생성
    const scene = new THREE.Scene();

    // 태양 광원 생성
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.position.set(0, 0, 3);
    scene.add(sun);

    // Uniforms 정의
    const atmosphereDayColor = uniform(color("#4db2ff"));
    const atmosphereTwilightColor = uniform(color("#bc490b"));
    const roughnessLow = uniform(0.25);
    const roughnessHigh = uniform(0.35);

    // 텍스쳐 로더 생성
    const textureLoader = new THREE.TextureLoader();
    const dayTexture = textureLoader.load("/earth_day_4096.jpg");
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = 8;

    const nightTexture = textureLoader.load("/earth_night_4096.jpg");
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.anisotropy = 8;

    const bumpRoughnessCloudsTexture = textureLoader.load(
      "/earth_bump_roughness_clouds_4096.jpg"
    );
    bumpRoughnessCloudsTexture.anisotropy = 8;

    // Fresnel 효과 개선
    const viewDirection = positionWorld.sub(cameraPosition).normalize();
    const fresnel = viewDirection
      .dot(normalWorldGeometry)
      .abs()
      .oneMinus()
      .toVar();

    // 태양 방향
    const sunOrientation = normalWorldGeometry
      .dot(normalize(sun.position))
      .toVar();

    // 대기 색상
    const atmosphereColor = mix(
      atmosphereTwilightColor,
      atmosphereDayColor,
      sunOrientation.smoothstep(-0.25, 0.75)
    );

    // Earth Material 생성
    const globeMaterial = new THREE.MeshStandardNodeMaterial();
    const cloudsStrength = texture(
      bumpRoughnessCloudsTexture,
      uv()
    ).b.smoothstep(0.2, 1);
    globeMaterial.colorNode = mix(
      texture(dayTexture),
      vec3(1),
      cloudsStrength.mul(2)
    );

    const roughness = max(
      texture(bumpRoughnessCloudsTexture).g,
      step(0.01, cloudsStrength)
    );
    globeMaterial.roughnessNode = roughness.remap(
      0,
      1,
      roughnessLow,
      roughnessHigh
    );

    const night = texture(nightTexture);
    const dayStrength = sunOrientation.smoothstep(-0.25, 0.5);

    const atmosphereDayStrength = sunOrientation.smoothstep(-0.5, 1);
    const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1);

    let finalOutput = mix(night.rgb, output.rgb, dayStrength);
    finalOutput = mix(finalOutput, atmosphereColor, atmosphereMix);
    globeMaterial.outputNode = vec4(finalOutput, output.a);

    const bumpElevation = max(
      texture(bumpRoughnessCloudsTexture).r,
      cloudsStrength
    );
    globeMaterial.normalNode = bumpMap(bumpElevation);

    // 지구 구체 생성
    const sphereGeometry = new THREE.SphereGeometry(1, 64, 64);
    const globe = new THREE.Mesh(sphereGeometry, globeMaterial);
    scene.add(globe);

    // 대기층 구성
    const atmosphereMaterial = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      transparent: true,
    });
    let alpha = fresnel.remap(0.73, 1, 1, 0).pow(3) as any;
    alpha = alpha.mul(sunOrientation.smoothstep(-0.5, 1));
    atmosphereMaterial.outputNode = vec4(atmosphereColor, alpha);

    const atmosphere = new THREE.Mesh(sphereGeometry, atmosphereMaterial);
    atmosphere.scale.setScalar(1.04);
    scene.add(atmosphere);

    // GUI (디버깅용)
    const gui = new GUI();
    gui
      .addColor(
        { color: atmosphereDayColor.value.getHex(THREE.SRGBColorSpace) },
        "color"
      )
      .onChange((value: any) => atmosphereDayColor.value.set(value))
      .name("atmosphereDayColor");
    gui
      .addColor(
        { color: atmosphereTwilightColor.value.getHex(THREE.SRGBColorSpace) },
        "color"
      )
      .onChange((value: any) => atmosphereTwilightColor.value.set(value))
      .name("atmosphereTwilightColor");
    gui.add(roughnessLow, "value", 0, 1, 0.001).name("roughnessLow");
    gui.add(roughnessHigh, "value", 0, 1, 0.001).name("roughnessHigh");

    // WebGPU 렌더러 생성
    const renderer = new THREE.WebGPURenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(
      mountRef.current.clientWidth,
      mountRef.current.clientHeight
    );
    mountRef.current.appendChild(renderer.domElement);

    // OrbitControls 추가
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 50;

    // Resize Event
    const onWindowResize = () => {
      camera.aspect =
        mountRef.current!.clientWidth / mountRef.current!.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(
        mountRef.current!.clientWidth,
        mountRef.current!.clientHeight
      );
    };
    window.addEventListener("resize", onWindowResize);

    // Animation Loop
    const animate = () => {
      const delta = clock.getDelta();
      globe.rotation.y += delta * 0.025; // 지구 자전
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      mountRef.current?.removeChild(renderer.domElement);
      window.removeEventListener("resize", onWindowResize);
      gui.destroy();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-screen"></div>;
}
