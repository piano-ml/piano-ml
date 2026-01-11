import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { WorkbenchComponent } from "./components/workbench/workbench.component";
import { SlugToWorkbenchComponent } from "./components/slug-to-workbench/slug-to-workbench.component";

export const desktopRouteList: Routes = [
    {
        path: '',
        component: WorkbenchComponent
    },
    {
        path: 'workbench',
        component: WorkbenchComponent
    },
   {
    path: ':slug',
    component: SlugToWorkbenchComponent
  }
];

@NgModule({
    imports: [
        RouterModule.forChild(desktopRouteList)
    ]
})
export class DesktopRoutingModule {
}