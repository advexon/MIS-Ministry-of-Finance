"use client"

import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, MoreHorizontal, Eye, Edit, Shield, Users, UserCheck } from "lucide-react"

const mockUsers = [
  { id: "1", name: "Alisher Saidov", email: "a.saidov@prsf.tj", role: "Admin", bank: "PRSF", isActive: true, lastLogin: "2026-02-06T10:30:00", language: "en" },
  { id: "2", name: "Farida Karimova", email: "f.karimova@prsf.tj", role: "Analyst", bank: "PRSF", isActive: true, lastLogin: "2026-02-05T14:15:00", language: "ru" },
  { id: "3", name: "Doniyor Rahimov", email: "d.rahimov@aib.tj", role: "Bank Officer", bank: "Agroinvestbank", isActive: true, lastLogin: "2026-02-06T09:00:00", language: "tj" },
  { id: "4", name: "Nasiba Tursunova", email: "n.tursunova@eskhata.tj", role: "Bank Officer", bank: "Bank Eskhata", isActive: true, lastLogin: "2026-02-04T16:30:00", language: "ru" },
  { id: "5", name: "Murod Ismoilov", email: "m.ismoilov@prsf.tj", role: "Manager", bank: "PRSF", isActive: true, lastLogin: "2026-02-06T08:45:00", language: "en" },
  { id: "6", name: "Safiya Mirzoeva", email: "s.mirzoeva@spitamen.tj", role: "Bank Officer", bank: "Spitamen Bank", isActive: false, lastLogin: "2025-12-15T11:00:00", language: "ru" },
]

const roleColors: Record<string, string> = {
  Admin: "bg-red-100 text-red-800",
  Analyst: "bg-blue-100 text-blue-800",
  "Bank Officer": "bg-emerald-100 text-emerald-800",
  Manager: "bg-amber-100 text-amber-800",
}

export default function UsersPage() {
  const { t } = useI18n()

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.users.title}</h1>
          <p className="mt-1 text-muted-foreground">Manage system users and their access roles</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t.users.newUser}</Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold">{mockUsers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><UserCheck className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{mockUsers.filter(u => u.isActive).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-red-500/10 p-3"><Shield className="h-5 w-5 text-red-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold">{mockUsers.filter(u => u.role === "Admin").length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">{t.auth.email}</TableHead>
                  <TableHead className="font-semibold">{t.users.role}</TableHead>
                  <TableHead className="font-semibold">Organization</TableHead>
                  <TableHead className="font-semibold">{t.users.preferredLanguage}</TableHead>
                  <TableHead className="font-semibold">{t.users.lastLogin}</TableHead>
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                  <TableHead className="text-right font-semibold">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={roleColors[user.role] || ""} variant="secondary">{user.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{user.bank}</TableCell>
                    <TableCell className="text-sm uppercase">{user.language}</TableCell>
                    <TableCell className="text-sm">{new Date(user.lastLogin).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={user.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />{t.common.view}</DropdownMenuItem>
                          <DropdownMenuItem><Edit className="mr-2 h-4 w-4" />{t.common.edit}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
