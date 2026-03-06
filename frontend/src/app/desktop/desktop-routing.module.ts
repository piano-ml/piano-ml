import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { WorkbenchComponent } from "./components/workbench/workbench.component";

export const desktopRouteList: Routes = [
    {
        path: '',
        component: WorkbenchComponent
    },
    {
        path: 'scale/:scaleKey/:selectedKey/:exerciseKey',
        component: WorkbenchComponent
    },  
    {
        path: 'chord/:chordKey/:selectedKey/:exerciseKey',
        component: WorkbenchComponent
    },
   {
    path: ':slug',
    component: WorkbenchComponent
  }
];

@NgModule({
    imports: [
        RouterModule.forChild(desktopRouteList)
    ]
})
export class DesktopRoutingModule {
}