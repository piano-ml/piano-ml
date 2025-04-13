import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { HomeComponent } from "./components/home/home.component";
import { SummaryComponent } from "./components/summary/summary.component";

export const desktopRouteList: Routes = [
    {
        path: '',
        component: HomeComponent
    },
    {
        path: 'summary',
        component: SummaryComponent,
        data: { breadcrumb: 'Summary' }
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(desktopRouteList)
    ]
})
export class HomeRoutingModule {
}