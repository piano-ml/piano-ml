import { NgModule } from "@angular/core";
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from "@angular/router";
import { HomeComponent } from "./components/home/home.component";
import { SummaryComponent } from "./components/summary/summary.component";
import { HOME_SEO, SUMMARY_SEO } from "./home.seo";

export const desktopRouteList: Routes = [
    {
        path: '',
        component: HomeComponent,
        data: { seo: HOME_SEO }
    },
    {
        path: 'summary',
        component: SummaryComponent,
        data: { breadcrumb: 'Summary', seo: SUMMARY_SEO }
    }
];

@NgModule({
    imports: [
        RouterModule.forChild(desktopRouteList)
    ]
})
export class HomeRoutingModule {
}
