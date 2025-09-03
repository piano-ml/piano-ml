import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { DesktopComponent } from "./components/desktop/desktop.component";
import { WorkbenchComponent } from "./components/workbench/workbench.component";

export const desktopRouteList: Routes = [
    {
        path: '',
        component: WorkbenchComponent
    },
    {
        path: 'workbench',
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