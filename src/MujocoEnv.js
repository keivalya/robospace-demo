// src/MujocoEnv.js
export class MujocoEnv {
    constructor(demo) {
      this.demo       = demo;
      this.model      = demo.model;
      this.simulation = demo.simulation;

      // Correct dims:
      const obsDim = this.simulation.qpos.length + this.simulation.qvel.length;
      const actDim = this.simulation.ctrl.length;
  
      // Observation: [qpos, qvel]
      this.observationSpace = {
        shape: [ obsDim ]
      };
      // Action: one ctrl value per actuator
      this.actionSpace = {
        class: 'Box',
        shape: [ actDim ],
        low:  Array.from(actDim).fill(-1),
        high: Array.from(actDim).fill(1)
      };
    }
  
    reset() {
      this.simulation.resetData();
      this.simulation.forward();
      return this._getObs();
    }
  
    async step(action) {
      // apply action → step → forward
      for (let i = 0; i < action.length; i++) {
        this.simulation.ctrl[i] = action[i];
      }
      this.simulation.step();
      this.simulation.forward();

      await new Promise(r => setTimeout(r, 20));
  
      const obs    = this._getObs();
      const reward = this._computeReward();
      const done   = this._checkDone();
    //   return { observation: obs, reward, done };
      return [ obs, reward, done ];
    }
  
    _getObs() {
      return [
        ...Array.from(this.simulation.qpos),
        ...Array.from(this.simulation.qvel)
      ];
    }
  
    _computeReward() {
      // e.g. +forward velocity on root body
      const vx = this.simulation.qvel[0];
      return vx;
    }
  
    _checkDone() {
      // simple time-limit or fallen-over check
      const z = this.simulation.xpos[2];
      return z < 0.2;
    }
  }
  