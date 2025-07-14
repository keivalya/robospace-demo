// main.js
import * as THREE           from 'three';
import { GUI              } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import { OrbitControls    } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { DragStateManager } from './utils/DragStateManager.js';
import { setupGUI, downloadExampleScenesFolder, loadSceneFromURL, getPosition, getQuaternion, toMujocoPos } from './mujocoUtils.js';
import   load_mujoco        from '../dist/mujoco_wasm.js';
import npyjs from './utils/npy.js';
import { FileUploadManager } from './utils/FileUploadManager.js';  // ADD THIS LINE

// Load the MuJoCo Module
const mujoco = await load_mujoco();

// Set up Emscripten's Virtual File System
var initialScene = "unitree_h1/scene.xml";
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working/');
await downloadExampleScenesFolder(mujoco);
mujoco.FS.writeFile("/working/" + initialScene, await(await fetch("./examples/scenes/" + initialScene)).text());

export class MuJoCoDemo {
  constructor() {
    this.mujoco = mujoco;

    // Load in the state from XML
    this.model      = new mujoco.Model("/working/" + initialScene);
    this.state      = new mujoco.State(this.model);
    this.simulation = new mujoco.Simulation(this.model, this.state);
    
    const physicsDtMs = this.model.getOptions().timestep * 1000;
    this._physicsInterval = setInterval(() => {
      if (!this.params.paused && !this.datasetPlayback) {
        this.simulation.step();
        this.simulation.forward();
      }
    }, physicsDtMs);

    // Define Random State Variables
    this.params = {
      scene: initialScene, 
      paused: false, 
      help: false,
      playbackSpeed: 1.0,
      currentDataset: 'none',
      followCamera: true,
      cameraDistance: 3.0,
      cameraHeight: 1.5
    };
    this.mujoco_time = 0.0;
    this.bodies  = {}, this.lights = {};
    this.tmpVec  = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();
    this.updateGUICallbacks = [];

    // Joint control
    this.selectedJoint = 0;
    this.jointSpeed = 0.5;

    // Dataset management
    this.datasets = {
      'none': null,
      'walk': { qpos: null, qvel: null, loaded: false },
      'run': { qpos: null, qvel: null, loaded: false },
      'squat': { qpos: null, qvel: null, loaded: false },
      'highjump': { qpos: null, qvel: null, loaded: false }
    };
    this.datasetPlayback = false;
    this.datasetFrameNumber = 0;
    this.datasetFPS = 40.0;
    this.lastDatasetUpdate = 0;

    // Camera follow state
    this.cameraOffset = new THREE.Vector3(2.0, 1.5, 2.0);
    this.cameraLookOffset = new THREE.Vector3(0, 0.7, 0);

    this.container = document.createElement( 'div' );
    document.body.appendChild( this.container );

    this.scene = new THREE.Scene();
    this.scene.name = 'scene';

    this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.001, 100 );
    this.camera.name = 'PerspectiveCamera';
    this.camera.position.set(2.0, 1.7, 1.7);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(0.15, 0.25, 0.35);
    this.scene.fog = new THREE.Fog(this.scene.background, 15, 25.5 );

    this.ambientLight = new THREE.AmbientLight( 0xffffff, 0.1 );
    this.ambientLight.name = 'AmbientLight';
    this.scene.add( this.ambientLight );

    this.renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setAnimationLoop( this.render.bind(this) );

    this.container.appendChild( this.renderer.domElement );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.7, 0);
    this.controls.panSpeed = 2;
    this.controls.zoomSpeed = 1;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.10;
    this.controls.screenSpacePanning = true;
    this.controls.update();

    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Initialize the Drag State Manager.
    this.dragStateManager = new DragStateManager(this.scene, this.renderer, this.camera, this.container.parentElement, this.controls);
    
    // Initialize file upload manager - ADD THIS LINE
    this.fileUploadManager = new FileUploadManager(mujoco, this);
    
    // Setup keyboard controls
    this.setupKeyboardControls();
  }

  async init() {
    // Initialize the three.js Scene using the .xml Model in initialScene
    [this.model, this.state, this.simulation, this.bodies, this.lights] =  
      await loadSceneFromURL(mujoco, initialScene, this);

    this.gui = new GUI();
    setupGUI(this);

    // Create upload interface - ADD THIS LINE
    this.fileUploadManager.createUploadInterface();

    // Try to preload all datasets
    await this.preloadDatasets();
  }

  // ADD THIS METHOD - Reload function for scene changes
  async reloadFunc() {
    this.scene.remove(this.scene.getObjectByName("MuJoCo Root"));
    
    // Check if it's a custom uploaded scene
    const isCustomScene = this.params.scene.startsWith('custom_scenes/');
    
    try {
      [this.model, this.state, this.simulation, this.bodies, this.lights] =
        await loadSceneFromURL(this.mujoco, this.params.scene, this);
      
      this.simulation.forward();
      
      for (let i = 0; i < this.updateGUICallbacks.length; i++) {
        this.updateGUICallbacks[i](this.model, this.simulation, this.params);
      }
      
      this.agent = null;
      this.policy = null;
      
      // Reset dataset playback for custom scenes
      if (isCustomScene) {
        this.datasetPlayback = false;
        this.params.currentDataset = 'none';
        this.selectedJoint = 0;
      }
      
    } catch (error) {
      console.error('Error loading scene:', error);
      alert(`Failed to load scene: ${error.message}\n\nMake sure all referenced files (robot XML and assets) are uploaded.`);
      
      // Revert to default scene on error
      this.params.scene = "unitree_h1/scene.xml";
      await this.reloadFunc();
    }
  }

  async preloadDatasets() {
    console.log("Preloading datasets...");
    const datasetNames = ['walk', 'run', 'squat', 'highjump'];
    
    for (const name of datasetNames) {
      try {
        await this.loadDataset(name);
      } catch (e) {
        console.log(`Failed to load ${name} dataset:`, e);
      }
    }
  }

  async loadDataset(name) {
    if (this.datasets[name].loaded) {
      console.log(`Dataset ${name} already loaded`);
      return;
    }

    this.npyjs = new npyjs();
    
    try {
      // Load qpos data
      await this.npyjs.load(`./examples/data/${name}_qpos.npy`, (loaded) => {
        console.log(`Loaded ${name} qpos: ${loaded.shape[0]} frames, ${loaded.shape[1]} DOFs`);
        if (loaded.shape[1] === this.model.nq) {
          this.datasets[name].qpos = loaded;
        } else {
          console.warn(`${name} qpos dimension mismatch: ${loaded.shape[1]} vs ${this.model.nq}`);
        }
      });

      // Load qvel data
      await this.npyjs.load(`./examples/data/${name}_qvel.npy`, (loaded) => {
        console.log(`Loaded ${name} qvel: ${loaded.shape[0]} frames, ${loaded.shape[1]} DOFs`);
        if (loaded.shape[1] === this.model.nv) {
          this.datasets[name].qvel = loaded;
        } else {
          console.warn(`${name} qvel dimension mismatch: ${loaded.shape[1]} vs ${this.model.nv}`);
        }
      });

      this.datasets[name].loaded = true;
      console.log(`✅ Dataset ${name} loaded successfully!`);
    } catch (e) {
      console.log(`Failed to load ${name} dataset:`, e);
      this.datasets[name].loaded = false;
    }
  }

  async switchDataset(name) {
    // Stop current playback
    this.datasetPlayback = false;
    
    // Reset frame counter
    this.datasetFrameNumber = 0;
    this.lastDatasetUpdate = 0;
    
    // Update current dataset
    this.params.currentDataset = name;
    
    if (name !== 'none' && this.datasets[name].loaded) {
      // Load dataset if not already loaded
      if (!this.datasets[name].qpos) {
        await this.loadDataset(name);
      }
      
      // Start playback if dataset is available
      if (this.datasets[name].qpos) {
        this.datasetPlayback = true;
        console.log(`Switched to ${name} dataset`);
      }
    } else if (name === 'none') {
      console.log('Dataset playback disabled');
    }
  }

  setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'INPUT') return;
      
      switch(event.key) {
        case 'ArrowUp':
          if (!this.datasetPlayback) {
            this.simulation.ctrl[this.selectedJoint] = Math.min(
              this.simulation.ctrl[this.selectedJoint] + this.jointSpeed,
              this.model.actuator_ctrlrange[this.selectedJoint * 2 + 1]
            );
          }
          event.preventDefault();
          break;
        case 'ArrowDown':
          if (!this.datasetPlayback) {
            this.simulation.ctrl[this.selectedJoint] = Math.max(
              this.simulation.ctrl[this.selectedJoint] - this.jointSpeed,
              this.model.actuator_ctrlrange[this.selectedJoint * 2]
            );
          }
          event.preventDefault();
          break;
        case 'ArrowLeft':
          this.selectedJoint = Math.max(0, this.selectedJoint - 1);
          console.log(`Selected joint: ${this.selectedJoint}`);
          event.preventDefault();
          break;
        case 'ArrowRight':
          this.selectedJoint = Math.min(this.model.nu - 1, this.selectedJoint + 1);
          console.log(`Selected joint: ${this.selectedJoint}`);
          event.preventDefault();
          break;
        case 'r':
        case 'R':
          // Reset all controls to zero
          for (let i = 0; i < this.model.nu; i++) {
            this.simulation.ctrl[i] = 0;
          }
          console.log('Reset all controls to zero');
          break;
        case 'h':
        case 'H':
          // Home position
          this.setHomePosition();
          break;
        case 'f':
        case 'F':
          // Toggle camera follow
          this.params.followCamera = !this.params.followCamera;
          console.log(`Camera follow: ${this.params.followCamera ? 'ON' : 'OFF'}`);
          break;
      }
    });
  }

  setHomePosition() {
    // For H1 humanoid, a slight squat is a good home position
    const homePositions = [
      0, 0, 0, 0.3, -0.6, 0.3,  // left leg
      0, 0, 0, 0.3, -0.6, 0.3,  // right leg
      0, 0, 0, 0, 0, 0, 0, 0    // torso and arms
    ];
    
    for (let i = 0; i < Math.min(homePositions.length, this.model.nu); i++) {
      this.simulation.ctrl[i] = homePositions[i];
    }
    console.log('Set home position');
  }

  updateCameraFollow() {
    if (!this.params.followCamera || !this.datasetPlayback) return;
    
    // Get robot's root position (pelvis)
    const pelvisPos = new THREE.Vector3();
    if (this.bodies[1]) { // Usually body 1 is the pelvis
      pelvisPos.copy(this.bodies[1].position);
    } else {
      // Fallback to simulation data
      getPosition(this.simulation.xpos, 1, pelvisPos);
    }
    
    // Calculate camera position based on robot position
    const angle = Date.now() * 0.0001; // Slow rotation
    const distance = this.params.cameraDistance;
    const height = this.params.cameraHeight;
    
    const cameraX = pelvisPos.x + Math.cos(angle) * distance;
    const cameraZ = pelvisPos.z + Math.sin(angle) * distance;
    const cameraY = pelvisPos.y + height;
    
    // Smoothly update camera position
    this.camera.position.lerp(new THREE.Vector3(cameraX, cameraY, cameraZ), 0.1);
    
    // Update controls target to look at robot
    const lookTarget = new THREE.Vector3(
      pelvisPos.x,
      pelvisPos.y + 0.7,
      pelvisPos.z
    );
    this.controls.target.lerp(lookTarget, 0.1);
    
    this.controls.update();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize( window.innerWidth, window.innerHeight );
  }

  render(timeMS) {
    this.controls.update();

    if (!this.params["paused"]) {
      let timestep = this.model.getOptions().timestep;
      if (timeMS - this.mujoco_time > 35.0) { this.mujoco_time = timeMS; }
      
      while (this.mujoco_time < timeMS) {
        // Dataset playback mode
        if (this.datasetPlayback && this.params.currentDataset !== 'none') {
          const dataset = this.datasets[this.params.currentDataset];
          
          if (dataset && dataset.qpos) {
            const currentTime = timeMS / 1000.0;
            const timeSinceLastUpdate = currentTime - this.lastDatasetUpdate;
            const framesToAdvance = timeSinceLastUpdate * this.datasetFPS * this.params.playbackSpeed;
            
            if (framesToAdvance >= 1.0 || this.lastDatasetUpdate === 0) {
              let frameIdx = Math.floor(this.datasetFrameNumber) % dataset.qpos.shape[0];
              
              // Apply position data
              const qposBase = frameIdx * dataset.qpos.shape[1];
              for (let i = 0; i < this.model.nq; i++) {
                this.simulation.qpos[i] = dataset.qpos.data[qposBase + i];
              }
              
              // Apply velocity data if available
              if (dataset.qvel) {
                const qvelBase = frameIdx * dataset.qvel.shape[1];
                for (let i = 0; i < this.model.nv; i++) {
                  this.simulation.qvel[i] = dataset.qvel.data[qvelBase + i];
                }
              }
              
              this.datasetFrameNumber += framesToAdvance;
              this.lastDatasetUpdate = currentTime;
              
              if (this.datasetFrameNumber >= dataset.qpos.shape[0]) {
                this.datasetFrameNumber = 0;
                console.log(`${this.params.currentDataset} dataset looped`);
              }
              
              this.simulation.forward();
            } else {
              this.simulation.forward();
            }
          }
        } else {
          // Normal simulation mode with control
          // Clear old perturbations
          for (let i = 0; i < this.simulation.qfrc_applied.length; i++) { 
            this.simulation.qfrc_applied[i] = 0.0; 
          }
          
          // Handle dragging
          let dragged = this.dragStateManager.physicsObject;
          if (dragged && dragged.bodyID) {
            for (let b = 0; b < this.model.nbody; b++) {
              if (this.bodies[b]) {
                getPosition  (this.simulation.xpos , b, this.bodies[b].position);
                getQuaternion(this.simulation.xquat, b, this.bodies[b].quaternion);
                this.bodies[b].updateWorldMatrix();
              }
            }
            let bodyID = dragged.bodyID;
            this.dragStateManager.update();
            let force = toMujocoPos(this.dragStateManager.currentWorld.clone().sub(this.dragStateManager.worldHit).multiplyScalar(this.model.body_mass[bodyID] * 250));
            let point = toMujocoPos(this.dragStateManager.worldHit.clone());
            this.simulation.applyForce(force.x, force.y, force.z, 0, 0, 0, point.x, point.y, point.z, bodyID);
          }

          this.simulation.step();
          this.simulation.forward();
        }

        this.mujoco_time += timestep * 1000.0;
      }

    } else if (this.params["paused"]) {
      // Handle dragging while paused
      this.dragStateManager.update();
      let dragged = this.dragStateManager.physicsObject;
      if (dragged && dragged.bodyID) {
        let b = dragged.bodyID;
        let offset = toMujocoPos(this.dragStateManager.currentWorld.clone()
          .sub(this.dragStateManager.worldHit).multiplyScalar(0.3));
        if (this.model.body_mocapid[b] >= 0) {
          let addr = this.model.body_mocapid[b] * 3;
          let pos  = this.simulation.mocap_pos;
          pos[addr+0] += offset.x;
          pos[addr+1] += offset.y;
          pos[addr+2] += offset.z;
        } else {
          let root = this.model.body_rootid[b];
          let addr = this.model.jnt_qposadr[this.model.body_jntadr[root]];
          let pos  = this.simulation.qpos;
          pos[addr+0] += offset.x;
          pos[addr+1] += offset.y;
          pos[addr+2] += offset.z;
        }
      }
      this.simulation.forward();
    }

    // Update body transforms.
    for (let b = 0; b < this.model.nbody; b++) {
      if (this.bodies[b]) {
        getPosition  (this.simulation.xpos , b, this.bodies[b].position);
        getQuaternion(this.simulation.xquat, b, this.bodies[b].quaternion);
        this.bodies[b].updateWorldMatrix();
      }
    }

    // Update camera to follow robot
    this.updateCameraFollow();

    // Update light transforms.
    for (let l = 0; l < this.model.nlight; l++) {
      if (this.lights[l]) {
        getPosition(this.simulation.light_xpos, l, this.lights[l].position);
        getPosition(this.simulation.light_xdir, l, this.tmpVec);
        this.lights[l].lookAt(this.tmpVec.add(this.lights[l].position));
      }
    }

    this.renderer.render( this.scene, this.camera );
  }
}

let demo = new MuJoCoDemo();
await demo.init();