import { MainScene } from './scenes/main.scene';
import { Vector3, Mesh, CubeTextureLoader, CubeTexture } from 'three';
import { DestinyLoaderBundle, DestinyModelLoader } from './destiny-model-loader/destiny-model-loader';
import { MaterialHelper } from './destiny-model-loader/material-helper';
import Axios from 'axios';
import { DestinyGearAssetsDefinition } from './destiny-model-loader/destiny-gear-asset-manifest';
import Vue from 'vue';
import { find as _find, findIndex as _findIndex} from 'lodash';
export class DresstinyApp {
	params:URLParams;
    envMap: CubeTexture;
    scene: MainScene;
	container: HTMLElement;
	itemDefinitions:{[id:string]:ListItem};
	gearDefinitions:{[id:string]:DestinyGearAssetsDefinition};
	characterClass:number;
	gender:number;
	fps: number = 60;
	itemList:ListItem[];
	gearSelector:Vue;
	meshes:{[id:string]:Mesh} = {};
	constructor() {
		this.init();
	}

	init(){
		this.params = this.extractURLParams();
		if(this.params.noUI) {
			document.body.classList.add('no-ui');
		}else{
			this.buildInterface();
		};
		this.buildScene();
		this.loadDefinitions().then(()=>{
			if(this.gearSelector){
				this.gearSelector.$data.characterClass = this.characterClass;
				this.gearSelector.$data.characterGender = this.gender;
				this.gearSelector.$data.helmet = this.itemDefinitions.helmet;
				this.gearSelector.$data.gauntlets = this.itemDefinitions.gauntlets;
				this.gearSelector.$data.chest = this.itemDefinitions.chest;
				this.gearSelector.$data.boots = this.itemDefinitions.boots;
				this.gearSelector.$data.classItem = this.itemDefinitions.classItem;
			};
			return this.loadGearDefinitions(this.itemDefinitions);
		}).then((res)=>{
			this.gearDefinitions = res;
			return this.loadEnvMap();
		}).then(()=>{
			return this.loadModels(['helmet', 'gauntlets', 'chest', 'boots', 'classItem']);
		}).then((res)=>{
			this.addModels(res);
			this.updateCameraControls();
		});
		this.initEventListeners();
		if(this.params.debug) this.scene.setupDebugger();
	}

	initEventListeners(){
		window.addEventListener("changeClass", (event:CustomEvent)=>{
			this.characterClass = event.detail.classType;
			this.params = {};
			this.parseDefinitions();
			this.loadGearDefinitions(this.itemDefinitions).then((res)=>{
				this.gearDefinitions = res;
				this.gearSelector.$data.characterClass = this.characterClass;
				this.gearSelector.$data.characterGender = this.gender;
				this.gearSelector.$data.helmet = this.itemDefinitions.helmet;
				this.gearSelector.$data.gauntlets = this.itemDefinitions.gauntlets;
				this.gearSelector.$data.chest = this.itemDefinitions.chest;
				this.gearSelector.$data.boots = this.itemDefinitions.boots;
				this.gearSelector.$data.classItem = this.itemDefinitions.classItem;
				return this.loadModels(['helmet', 'gauntlets', 'chest', 'boots', 'classItem']);
			}).then((res)=>{
				this.addModels(res);
			})
		})
		window.addEventListener("changeGender", (event:CustomEvent)=>{
			this.gender = event.detail.gender;
			this.gearSelector.$data.characterGender = this.gender;
			this.params = {};
			return this.loadModels(['helmet', 'gauntlets', 'chest', 'boots', 'classItem'])
			.then((res)=>{
				this.addModels(res);
			})
		})
		window.addEventListener("openSelector", (event:CustomEvent)=>{
			this.gearSelector.$data.changerOpened = true;
			this.gearSelector.$data.changingType = event.detail.itemSubType;
			let itemList = this.itemList.filter((item)=>{
				if(event.detail.isShader){
					return item.itemSubType == 20;
				}
				return item.itemSubType == event.detail.itemSubType &&
					(item.classType == this.characterClass);
				}).sort((itemA, itemB)=>{
					return (itemB.tierType - itemA.tierType) || (itemB.index - itemA.index);
				});

			let ornaments = this.itemList.filter((item)=>{
				return item.itemSubType == 21 && item.classType == this.characterClass;
			}).sort((itemA, itemB)=>{
				return itemB.index - itemA.index;
			});

			ornaments.forEach((ornament)=>{
				let index = _findIndex(itemList, {hash:ornament.previewItemOverrideHash});
				if(index > -1){
					itemList.splice(index+1, 0, ornament);
				}
			});

			this.gearSelector.$data.itemList = itemList;
		});

		window.addEventListener("changeItem", (event:CustomEvent)=>{
			let item:ListItem = event.detail.item;
			let types = {
				26:"helmet",
				27:"gauntlets",
				28:"chest",
				29:"boots",
				30:"classItem"
			};
			let type = types[this.gearSelector.$data.changingType];
			let shaderType = null;
			let bundle = {};
			if(item.itemSubType == 20){
				shaderType = `${type}Shader`;
				bundle[shaderType] = item;
			}else{
				bundle[type] = item;
			}
			this.loadGearDefinitions(bundle)
			.then((res)=>{
				if(shaderType){
					this.itemDefinitions[shaderType] = item;
					this.gearDefinitions[shaderType] = res[shaderType];
					this.gearSelector.$data[shaderType] = item;
					return this.loadModels([type]);
				}
				this.itemDefinitions[type] = item;
				this.gearDefinitions[type] = res[type];
				this.gearSelector.$data[type] = item;
				return this.loadModels([type]);
			}).then((res)=>{
				return this.addModels(res);
			});
		});
	}

	loadDefinitions():Promise<{[id:string]:ListItem}>{
		return Axios.get(`database/manifest/en/list.json`).then((list)=>{
			this.itemList = list.data;
			this.parseDefinitions();
			return this.itemDefinitions;
		});
	}

	parseDefinitions(){
		if([0,1].indexOf(this.params.gender) > -1){
			this.gender = this.params.gender;
		}else if(this.gender == undefined){
			this.gender = Math.round(Math.random());
		}
		if([0,1,2].indexOf(this.params.class) > -1){
			this.characterClass = this.params.class;
		}else if (this.characterClass == undefined){
			this.characterClass = this.getClassFromEquipment();
		}
		this.itemDefinitions = {};
		let pieces = ["helmet", "chest", "gauntlets", "boots", "classItem"];
		let itemSubTypes = [26, 28, 27, 29, 30];
		this.itemDefinitions = {};
		pieces.forEach((piece, index)=>{
			this.itemDefinitions[piece] = this.getDefinitionForItem(piece, this.characterClass, itemSubTypes[index]);
		});
	}

	getDefinitionForItem(pieceName: string, charClass:number, subType: number): any {
        let hash = this.params[pieceName];
		let manifest:ListItem = _find(this.itemList, (item)=>item.hash == hash) as ListItem;
		if(manifest && manifest.classType==charClass && manifest.itemSubType == subType){
			return manifest;
		}
		let filteredList = this.itemList.filter((item)=>item.classType == charClass && item.itemSubType == subType);
		return filteredList[Math.floor(Math.random()*filteredList.length)];
    }

	getClassFromEquipment():number{
		let pieceOrder = ["helmet", "chest", "gauntlets", "boots", "classItem"];
		let charClass:number;
		pieceOrder.forEach((piece)=>{
			if(charClass != undefined || !this.params[piece]) return;
			let hash = this.params[piece];
			let manifest:ListItem = _find(this.itemList, (item)=>item.hash == hash) as ListItem;
			charClass = manifest.classType;
		});

		if(charClass != undefined){
			return charClass;
		}
		return Math.round(Math.random()*2);
	}

	buildScene(){
		this.container = document.getElementById('container-3d');
		this.scene = new MainScene(this.container.offsetWidth, this.container.offsetHeight, this.container);
		window.onresize = ()=>{
			this.scene.changeSize(this.container.offsetWidth, this.container.offsetHeight);
		};
		this.container.appendChild(this.scene.renderer.domElement);
		setInterval(()=>{
			this.scene.render();
		},10);
	}

	buildInterface(){
		this.gearSelector = new Vue({
			el:'#interface',
			data:{
				characterClass:this.characterClass,
				characterGender:this.gender,
				helmet:null,
				helmetShader:null,
				chest:null,
				chestShader:null,
				gauntlets:null,
				gauntletsShader:null,
				boots:null,
				bootsShader:null,
				classItem:null,
				classItemShader:null,
				changerItemSubType:null,
				changerOpened:false,
				changingType:null,
				itemList:null
			},
			components:{
				'class-selector':require('./components/class-selector.vue').default,
				'gender-selector':require('./components/gender-selector.vue').default,
				'gear-selector':require('./components/gear-selector.vue').default,
				'gear-list':require('./components/gear-list.vue').default,
				'deep-linker':require('./components/deep-linker.vue').default
			}
		});
	}

	loadGearDefinitions(itemDefinitions){
		let promises = [];
		let definitions = {};
		for(let i in itemDefinitions){
			let def = itemDefinitions[i];
			let promise = Axios.get(`database/gearAssets/${def.hash}.json`)
			.then((res)=>{
				definitions[i] = res.data;
				return res;
			});
			promises.push(promise);
		}
		return Promise.all(promises).then(()=>{
			return definitions;
		});
	}

	loadEnvMap(){
		return new Promise((resolve)=>{
			let textureLoader = new CubeTextureLoader();
			textureLoader.load([
				'assets/cubeleft.jpg','assets/cuberight.jpg',
				'assets/cubeback.jpg','assets/cubefront.jpg',
				'assets/cubedown.jpg','assets/cubeup.jpg',
			], (envMap)=>{
				envMap.generateMipmaps = true;
				this.envMap = envMap;
				resolve(envMap);
			});
		})
	}

	loadModels(ids:string[]) {
		let modelLoader:DestinyModelLoader = new DestinyModelLoader();
		console.log(this.gender);
		let items = ids.map((id)=>({itemDefinition:this.gearDefinitions[id], shaderDefinition:this.gearDefinitions[`${id}Shader`], female:this.gender == 1}));
		return modelLoader.load(items)
		.then((models)=>{
			let meshes:{[id:string]:Mesh} = {};
			models.forEach((model:DestinyLoaderBundle, index)=>{
				MaterialHelper.addPropertyToAllMaterials(model.materials, 'envMap', this.envMap);
				// MaterialHelper.addPropertyToAllMaterials(model.materials, 'envMapIntensity', 0.2);
				meshes[ids[index]] = new Mesh(model.geometry, model.materials);
			});
			return meshes;
		});
	}

	addModels(meshes:{[id:string]:Mesh}){
		for(let i in meshes){
			if(this.meshes[i]) {
				this.scene.remove(this.meshes[i]);
				this.meshes[i] = null;
			}
			let mesh = meshes[i];
			this.meshes[i] = mesh;
			this.scene.add(mesh);
			mesh.geometry.computeBoundingBox();
		};
	}

	updateCameraControls(){
		let min:Vector3;
		let max:Vector3;
		for(let i in this.meshes){
			let mesh = this.meshes[i];
			if(!min) min = mesh.geometry.boundingBox.min;
			if(!max) max = mesh.geometry.boundingBox.max;
			min.min(mesh.geometry.boundingBox.min);
			max.max(mesh.geometry.boundingBox.max);
		};
		let center = new Vector3(max.x/2 +min.x/2, max.y/2 + min.y/2, max.z/2 + min.z/2);
		let maxDistance:number = 0;
		['x', 'y', 'z'].forEach((prop)=>{
			maxDistance = Math.max(maxDistance, Math.abs(center[prop] - max[prop]));
			maxDistance = Math.max(maxDistance, Math.abs(center[prop] - min[prop]));
		});
		this.scene.updateCameraControls(center, maxDistance);
	}

	extractURLParams(): any {
		try{
			let paramString = window.location.href.split('?')[1];
			let params = paramString.split("&");
			let paramResult = {};
			params.forEach((param)=>{
				let splitted = param.split('=');
				paramResult[splitted[0]] = parseInt(splitted[1]);
			})
	        return paramResult;
		}catch(e){
			return {};
		}
    }
}

interface URLParams{
	helmet?:number;
	helmetShader?:number;
	gauntlets?:number;
	gauntletsShader?:number;
	chest?:number;
	chestShader?:number;
	boots?:number;
	bootsShader?:number;
	classItem?:number;
	classItemShader?:number;
	class?:number;
	gender?:number;
	debug?:number;
	noUI?:number;
}

interface ListItem{
	name:string;
	hash:number;
	icon:string;
	index:number;
	itemType:number;
	itemSubType:number;
	classType:number;
	tierType:number;
	previewItemOverrideHash:number;
}
