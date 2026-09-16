export interface CatalogVariant { article:string;name:string;color:string;source:string }
export interface CatalogItem {
 id:string;name:string;category:string;style:string;color:string;size:string;type:string;
 brand?:string;dimensions?:[number,number,number];image?:string;model?:string;source?:string;
 license?:string;licenseFile?:string;creator?:string;precision?:string;elevation?:number;styleKey?:string;
 article?:string;series?:string;description?:string;variants?:CatalogVariant[];
 measures?:Record<string,number>;typeTags?:string[];styleTags?:string[];
 retired?:boolean;retirementReason?:string;quality?:string;modelBytes?:number;materialMaps?:number;constructionDetails?:string[];
}
