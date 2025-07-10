import * as THREE from 'three';
import { Reflector  } from './utils/Reflector.js';
import { MuJoCoDemo } from './main.js';

export async function reloadFunc() {
  this.scene.remove(this.scene.getObjectByName("MuJoCo Root"));
  [this.model, this.state, this.simulation, this.bodies, this.lights] =
    await loadSceneFromURL(this.mujoco, this.params.scene, this);
  this.simulation.forward();
  for (let i = 0; i < this.updateGUICallbacks.length; i++) {
    this.updateGUICallbacks[i](this.model, this.simulation, this.params);
  }
  this.agent  = null;
  this.policy = null;
}

/** @param {MuJoCoDemo} parentContext*/
export function setupGUI(parentContext) {

  // Make sure we reset the camera when the scene is changed or reloaded.
  parentContext.updateGUICallbacks.length = 0;
  parentContext.updateGUICallbacks.push((model, simulation, params) => {
    parentContext.camera.position.set(2.0, 1.7, 1.7);
    parentContext.controls.target.set(0, 0.7, 0);
    parentContext.controls.update(); 
  });
  
  // Add scene selection dropdown.
  let reload = reloadFunc.bind(parentContext);
  parentContext.gui.add(parentContext.params, 'scene', {
    "Unitree A1": "unitree_a1/scene.xml",
    "Unitree H1": "unitree_h1/scene.xml",
    "Unitree Go1": "unitree_go1/scene.xml",
    "Humanoid": "humanoid.xml",
    "Ant": "ant.xml",
  }).name('Robot Model').onChange((val) => {
    parentContext.selectedJoint = 0;
    reload();
  });

  let simulationFolder = parentContext.gui.addFolder("Simulation");
  
  // Add pause simulation checkbox.
  const pauseSimulation = simulationFolder.add(parentContext.params, 'paused').name('Pause Simulation');
  pauseSimulation.onChange((value) => {
    if (value) {
      const pausedText = document.createElement('div');
      pausedText.style.position = 'absolute';
      pausedText.style.top = '10px';
      pausedText.style.left = '10px';
      pausedText.style.color = 'white';
      pausedText.style.font = 'normal 18px Arial';
      pausedText.innerHTML = 'paused';
      pausedText.id = 'pausedText';
      parentContext.container.appendChild(pausedText);
    } else {
      const pausedText = document.getElementById('pausedText');
      if (pausedText) {
        parentContext.container.removeChild(pausedText);
      }
    }
  });
  
  // Control noise parameters
  simulationFolder.add(parentContext.params, 'ctrlnoiserate', 0.0, 2.0, 0.01).name('Control Noise Rate');
  simulationFolder.add(parentContext.params, 'ctrlnoisestd', 0.0, 1.0, 0.01).name('Control Noise Std');
  
  simulationFolder.close();

  // Add actuator controls
  let actuatorFolder = parentContext.gui.addFolder("Actuators");
  const addActuators = (model, simulation, params) => {
    let act_range = model.actuator_ctrlrange;
    let actuatorGUIs = [];
    for (let i = 0; i < model.nu; i++) {
      let name = "Actuator " + i;
      parentContext.params[name] = 0.0;
      let actuatorGUI = actuatorFolder.add(parentContext.params, name, act_range[2 * i], act_range[2 * i + 1], 0.01)
        .name(name)
        .listen();
      actuatorGUIs.push(actuatorGUI);
      actuatorGUI.onChange((value) => {
        simulation.ctrl[i] = value;
      });
    }
    return actuatorGUIs;
  };
  let actuatorGUIs = addActuators(parentContext.model, parentContext.simulation, parentContext.params);
  parentContext.updateGUICallbacks.push((model, simulation, params) => {
    for (let i = 0; i < actuatorGUIs.length; i++) {
      actuatorGUIs[i].destroy();
    }
    actuatorGUIs = addActuators(model, simulation, parentContext.params);
  });
  actuatorFolder.open();

  // Joint control settings
  let controlFolder = parentContext.gui.addFolder("Joint Control");
  controlFolder.add(parentContext, 'selectedJoint', 0, parentContext.model.nu - 1, 1).name('Selected Joint').listen();
  controlFolder.add(parentContext, 'jointSpeed', 0.1, 2.0, 0.1).name('Control Speed');
  controlFolder.open();

  // Add help text
  let helpFolder = parentContext.gui.addFolder("Keyboard Controls");
  const helpText = {
    message: `Arrow Up/Down: Control selected joint
Arrow Left/Right: Select joint
R: Reset all joints to zero
H: Home position (stand)
Space: Pause simulation
Ctrl+A: Reset camera`
  };
  helpFolder.add(helpText, 'message').name('Keys');
  helpFolder.open();

  // Keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      parentContext.params.paused = !parentContext.params.paused;
      pauseSimulation.setValue(parentContext.params.paused);
      event.preventDefault();
    }
    if (event.ctrlKey && event.code === 'KeyA') {
      parentContext.camera.position.set(2.0, 1.7, 1.7);
      parentContext.controls.target.set(0, 0.7, 0);
      parentContext.controls.update(); 
      event.preventDefault();
    }
  });

  parentContext.gui.open();
}

/** Loads a scene for MuJoCo
 * @param {mujoco} mujoco This is a reference to the mujoco namespace object
 * @param {string} filename This is the name of the .xml file in the /working/ directory of the MuJoCo/Emscripten Virtual File System
 * @param {MuJoCoDemo} parent The three.js Scene Object to add the MuJoCo model elements to
 */
export async function loadSceneFromURL(mujoco, filename, parent) {
    // Free the old simulation.
    if (parent.simulation != null) {
      parent.simulation.free();
      parent.model      = null;
      parent.state      = null;
      parent.simulation = null;
      parent.agent      = null;
      parent.policy     = null;
    }

    // Load in the state from XML.
    console.log("Loading model from XML: " + filename);
    parent.model       = mujoco.Model.load_from_xml("/working/"+filename);
    parent.state       = new mujoco.State(parent.model);
    parent.simulation  = new mujoco.Simulation(parent.model, parent.state);

    let model = parent.model;
    let state = parent.state;
    let simulation = parent.simulation;

    // Decode the null-terminated string names.
    let textDecoder = new TextDecoder("utf-8");
    let names_array = new Uint8Array(model.names);
    let fullString = textDecoder.decode(model.names);
    let names = fullString.split(textDecoder.decode(new ArrayBuffer(1)));

    // Create the root object.
    let mujocoRoot = new THREE.Group();
    mujocoRoot.name = "MuJoCo Root"
    parent.scene.add(mujocoRoot);

    console.log('✅ loadSceneFromURL added root →', mujocoRoot.name);

    /** @type {Object.<number, THREE.Group>} */
    let bodies = {};
    /** @type {Object.<number, THREE.BufferGeometry>} */
    let meshes = {};
    /** @type {THREE.Light[]} */
    let lights = [];

    // Default material definition.
    let material = new THREE.MeshPhysicalMaterial();
    material.color = new THREE.Color(1, 1, 1);

    // Loop through the MuJoCo geoms and recreate them in three.js.
    for (let g = 0; g < model.ngeom; g++) {
      // Only visualize geom groups up to 2 (same default behavior as simulate).
      if (!(model.geom_group[g] < 3)) { continue; }

      let b = model.geom_bodyid[g];
      let type = model.geom_type[g];
      let size = [
        model.geom_size[(g*3) + 0],
        model.geom_size[(g*3) + 1],
        model.geom_size[(g*3) + 2]
      ];

      if (!(b in bodies)) {
        bodies[b] = new THREE.Group();
        
        let start_idx = model.name_bodyadr[b];
        let end_idx = start_idx;
        while (end_idx < names_array.length && names_array[end_idx] !== 0) {
          end_idx++;
        }
        let name_buffer = names_array.subarray(start_idx, end_idx);
        bodies[b].name = textDecoder.decode(name_buffer);
        
        bodies[b].bodyID = b;
        bodies[b].has_custom_mesh = false;
      }

      // Set the default geometry. In MuJoCo, this is a sphere.
      let geometry = new THREE.SphereGeometry(size[0] * 0.5);
      if (type == mujoco.mjtGeom.mjGEOM_PLANE.value) {
        // Special handling for plane later.
      } else if (type == mujoco.mjtGeom.mjGEOM_HFIELD.value) {
        // TODO: Implement this.
      } else if (type == mujoco.mjtGeom.mjGEOM_SPHERE.value) {
        geometry = new THREE.SphereGeometry(size[0]);
      } else if (type == mujoco.mjtGeom.mjGEOM_CAPSULE.value) {
        geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2.0, 20, 20);
      } else if (type == mujoco.mjtGeom.mjGEOM_ELLIPSOID.value) {
        geometry = new THREE.SphereGeometry(1); // Stretch this below
      } else if (type == mujoco.mjtGeom.mjGEOM_CYLINDER.value) {
        geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2.0);
      } else if (type == mujoco.mjtGeom.mjGEOM_BOX.value) {
        geometry = new THREE.BoxGeometry(size[0] * 2.0, size[2] * 2.0, size[1] * 2.0);
      } else if (type == mujoco.mjtGeom.mjGEOM_MESH.value) {
        let meshID = model.geom_dataid[g];

        if (!(meshID in meshes)) {
          geometry = new THREE.BufferGeometry(); // TODO: Populate the Buffer Geometry with Generic Mesh Data

          let vertex_buffer = model.mesh_vert.subarray(
             model.mesh_vertadr[meshID] * 3,
            (model.mesh_vertadr[meshID]  + model.mesh_vertnum[meshID]) * 3);
          for (let v = 0; v < vertex_buffer.length; v+=3){
            //vertex_buffer[v + 0] =  vertex_buffer[v + 0];
            let temp             =  vertex_buffer[v + 1];
            vertex_buffer[v + 1] =  vertex_buffer[v + 2];
            vertex_buffer[v + 2] = -temp;
          }

          let normal_buffer = model.mesh_normal.subarray(
             model.mesh_vertadr[meshID] * 3,
            (model.mesh_vertadr[meshID]  + model.mesh_vertnum[meshID]) * 3);
          for (let v = 0; v < normal_buffer.length; v+=3){
            //normal_buffer[v + 0] =  normal_buffer[v + 0];
            let temp             =  normal_buffer[v + 1];
            normal_buffer[v + 1] =  normal_buffer[v + 2];
            normal_buffer[v + 2] = -temp;
          }

          let uv_buffer = model.mesh_texcoord.subarray(
             model.mesh_texcoordadr[meshID] * 2,
            (model.mesh_texcoordadr[meshID]  + model.mesh_vertnum[meshID]) * 2);
          let triangle_buffer = model.mesh_face.subarray(
             model.mesh_faceadr[meshID] * 3,
            (model.mesh_faceadr[meshID]  + model.mesh_facenum[meshID]) * 3);
          geometry.setAttribute("position", new THREE.BufferAttribute(vertex_buffer, 3));
          geometry.setAttribute("normal"  , new THREE.BufferAttribute(normal_buffer, 3));
          geometry.setAttribute("uv"      , new THREE.BufferAttribute(    uv_buffer, 2));
          geometry.setIndex    (Array.from(triangle_buffer));
          meshes[meshID] = geometry;
        } else {
          geometry = meshes[meshID];
        }

        bodies[b].has_custom_mesh = true;
      }
      // Done with geometry creation.

      // Set the Material Properties of incoming bodies
      let texture = undefined;
      let color = [
        model.geom_rgba[(g * 4) + 0],
        model.geom_rgba[(g * 4) + 1],
        model.geom_rgba[(g * 4) + 2],
        model.geom_rgba[(g * 4) + 3]];
      if (model.geom_matid[g] != -1) {
        let matId = model.geom_matid[g];
        color = [
          model.mat_rgba[(matId * 4) + 0],
          model.mat_rgba[(matId * 4) + 1],
          model.mat_rgba[(matId * 4) + 2],
          model.mat_rgba[(matId * 4) + 3]];

        // Construct Texture from model.tex_rgb
        texture = undefined;
        let texId = model.mat_texid[matId];
        if (texId != -1) {
          let width    = model.tex_width [texId];
          let height   = model.tex_height[texId];
          let offset   = model.tex_adr   [texId];
          let rgbArray = model.tex_rgb   ;
          let rgbaArray = new Uint8Array(width * height * 4);
          for (let p = 0; p < width * height; p++){
            rgbaArray[(p * 4) + 0] = rgbArray[offset + ((p * 3) + 0)];
            rgbaArray[(p * 4) + 1] = rgbArray[offset + ((p * 3) + 1)];
            rgbaArray[(p * 4) + 2] = rgbArray[offset + ((p * 3) + 2)];
            rgbaArray[(p * 4) + 3] = 1.0;
          }
          texture = new THREE.DataTexture(rgbaArray, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
          if (texId == 2) {
            texture.repeat = new THREE.Vector2(50, 50);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
          } else {
            texture.repeat = new THREE.Vector2(1, 1);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
          }

          texture.needsUpdate = true;
        }
      }

      if (material.color.r != color[0] ||
          material.color.g != color[1] ||
          material.color.b != color[2] ||
          material.opacity != color[3] ||
          material.map     != texture) {
        material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(color[0], color[1], color[2]),
          transparent: color[3] < 1.0,
          opacity: color[3],
          specularIntensity: model.geom_matid[g] != -1 ?       model.mat_specular   [model.geom_matid[g]] *0.5 : 0.5,
          reflectivity     : model.geom_matid[g] != -1 ?       model.mat_reflectance[model.geom_matid[g]] : 0.1,
          roughness        : model.geom_matid[g] != -1 ? 1.0 - model.mat_shininess  [model.geom_matid[g]] : 0.6,
          metalness        : model.geom_matid[g] != -1 ? 0.1 : 0.1,
          // map              : texture ? texture : undefined
        });
      }

      let mesh = new THREE.Mesh();
      if (type == 0) {
        mesh = new Reflector( new THREE.PlaneGeometry( 100, 100 ), { clipBias: 0.003,texture: texture } );
        mesh.rotateX( - Math.PI / 2 );
      } else {
        mesh = new THREE.Mesh(geometry, material);
      }

      mesh.castShadow = g == 0 ? false : true;
      mesh.receiveShadow = type != 7;
      mesh.bodyID = b;
      bodies[b].add(mesh);
      getPosition  (model.geom_pos, g, mesh.position  );
      if (type != 0) { getQuaternion(model.geom_quat, g, mesh.quaternion); }
      if (type == 4) { mesh.scale.set(size[0], size[2], size[1]) } // Stretch the Ellipsoid
    }

    // Parse lights.
    for (let l = 0; l < model.nlight; l++) {
      let light = new THREE.SpotLight();
      if (model.light_directional[l]) {
        light = new THREE.DirectionalLight();
      } else {
        light = new THREE.SpotLight();
      }
      light.decay = model.light_attenuation[l] * 100;
      light.penumbra = 0.5;
      light.castShadow = true; // default false

      light.shadow.mapSize.width = 1024; // default
      light.shadow.mapSize.height = 1024; // default
      light.shadow.camera.near = 1; // default
      light.shadow.camera.far = 10; // default
      //bodies[model.light_bodyid()].add(light);
      if (bodies[0]) {
        bodies[0].add(light);
      } else {
        mujocoRoot.add(light);
      }
      lights.push(light);
    }
    if (model.nlight == 0) {
      let light = new THREE.DirectionalLight();
      mujocoRoot.add(light);
    }

    for (let b = 0; b < model.nbody; b++) {
      //let parent_body = model.body_parentid()[b];
      if (b == 0 || !bodies[0]) {
        mujocoRoot.add(bodies[b]);
      } else if(bodies[b]){
        bodies[0].add(bodies[b]);
      } else {
        console.log("Body without Geometry detected; adding to bodies", b, bodies[b]);
        bodies[b] = new THREE.Group(); bodies[b].name = names[b + 1]; bodies[b].bodyID = b; bodies[b].has_custom_mesh = false;
        bodies[0].add(bodies[b]);
      }
    }
  
    parent.mujocoRoot = mujocoRoot;

    return [model, state, simulation, bodies, lights]
}

/** Downloads the scenes/examples folder to MuJoCo's virtual filesystem
 * @param {mujoco} mujoco */
export async function downloadExampleScenesFolder(mujoco) {
  let allFiles = [
    "ant.xml",
    "humanoid.xml",
    "inverted_double_pendulum.xml",
    "pusher.xml",
    "unitree_a1/assets/calf.obj",
    "unitree_a1/assets/hip.obj",
    "unitree_a1/assets/thigh.obj",
    "unitree_a1/assets/thigh_mirror.obj",
    "unitree_a1/assets/trunk.obj",
    "unitree_a1/assets/trunk_A1.png",
    "unitree_a1/scene.xml",
    "unitree_a1/unitree_a1.xml",
    "unitree_go1/assets/calf.stl",
    "unitree_go1/assets/hip.stl",
    "unitree_go1/assets/thigh.stl",
    "unitree_go1/assets/thigh_mirror.stl",
    "unitree_go1/assets/trunk.stl",
    "unitree_go1/go1.xml",
    "unitree_go1/scene.xml",
    "unitree_h1/assets/left_ankle_link.stl",
    "unitree_h1/assets/left_elbow_link.stl",
    "unitree_h1/assets/left_hip_pitch_link.stl",
    "unitree_h1/assets/left_hip_roll_link.stl",
    "unitree_h1/assets/left_hip_yaw_link.stl",
    "unitree_h1/assets/left_knee_link.stl",
    "unitree_h1/assets/left_shoulder_pitch_link.stl",
    "unitree_h1/assets/left_shoulder_roll_link.stl",
    "unitree_h1/assets/left_shoulder_yaw_link.stl",
    "unitree_h1/assets/logo_link.stl",
    "unitree_h1/assets/pelvis.stl",
    "unitree_h1/assets/right_ankle_link.stl",
    "unitree_h1/assets/right_elbow_link.stl",
    "unitree_h1/assets/right_hip_pitch_link.stl",
    "unitree_h1/assets/right_hip_roll_link.stl",
    "unitree_h1/assets/right_hip_yaw_link.stl",
    "unitree_h1/assets/right_knee_link.stl",
    "unitree_h1/assets/right_shoulder_pitch_link.stl",
    "unitree_h1/assets/right_shoulder_roll_link.stl",
    "unitree_h1/assets/right_shoulder_yaw_link.stl",
    "unitree_h1/assets/torso_link.stl",
    "unitree_h1/h1.xml",
    "unitree_h1/scene.xml"
  ];

  let requests = allFiles.map((url) => fetch("./examples/scenes/" + url));
  let responses = await Promise.all(requests);
  for (let i = 0; i < responses.length; i++) {
      let split = allFiles[i].split("/");
      let working = '/working/';
      for (let f = 0; f < split.length - 1; f++) {
          working += split[f];
          if (!mujoco.FS.analyzePath(working).exists) { mujoco.FS.mkdir(working); }
          working += "/";
      }

      if (allFiles[i].endsWith(".png") || allFiles[i].endsWith(".stl") || allFiles[i].endsWith(".skn")) {
          mujoco.FS.writeFile("/working/" + allFiles[i], new Uint8Array(await responses[i].arrayBuffer()));
      } else {
          mujoco.FS.writeFile("/working/" + allFiles[i], await responses[i].text());
      }
  }
}

/** Access the vector at index, swizzle for three.js, and apply to the target THREE.Vector3
 * @param {Float32Array|Float64Array} buffer
 * @param {number} index
 * @param {THREE.Vector3} target */
export function getPosition(buffer, index, target, swizzle = true) {
  if (swizzle) {
    return target.set(
       buffer[(index * 3) + 0],
       buffer[(index * 3) + 2],
      -buffer[(index * 3) + 1]);
  } else {
    return target.set(
       buffer[(index * 3) + 0],
       buffer[(index * 3) + 1],
       buffer[(index * 3) + 2]);
  }
}

/** Access the quaternion at index, swizzle for three.js, and apply to the target THREE.Quaternion
 * @param {Float32Array|Float64Array} buffer
 * @param {number} index
 * @param {THREE.Quaternion} target */
export function getQuaternion(buffer, index, target, swizzle = true) {
  if (swizzle) {
    return target.set(
      -buffer[(index * 4) + 1],
      -buffer[(index * 4) + 3],
       buffer[(index * 4) + 2],
      -buffer[(index * 4) + 0]);
  } else {
    return target.set(
       buffer[(index * 4) + 0],
       buffer[(index * 4) + 1],
       buffer[(index * 4) + 2],
       buffer[(index * 4) + 3]);
  }
}

/** Converts this Vector3's Handedness to MuJoCo's Coordinate Handedness
 * @param {THREE.Vector3} target */
export function toMujocoPos(target) { return target.set(target.x, -target.z, target.y); }

/** Standard normal random number generator using Box-Muller transform */
export function standardNormal() {
  return Math.sqrt(-2.0 * Math.log( Math.random())) *
         Math.cos ( 2.0 * Math.PI * Math.random()); }

